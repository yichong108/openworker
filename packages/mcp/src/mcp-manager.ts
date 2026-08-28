/**
 * MCP 发现与 stdio 连接池。
 *
 * 按 `McpServerEntry.id` 复用连接；配置变更时重连；空闲后自动关闭。
 * 每个 `McpManager` 实例各自一池；进程级单例由宿主持有。
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  getDefaultEnvironment,
  StdioClientTransport
} from '@modelcontextprotocol/sdk/client/stdio.js'
import type { McpServerEntry } from '@openworker/shared'

import { defineTool, mergeToolSets, type ToolOnTool, type ToolSet } from '@openworker/tools'

import { loadMcpServersFromConfig } from './load-config.js'
import { mcpLog } from './logger.js'
import { mcpInputSchemaToParameters } from './mcp-parameters.js'
import type { McpProbeResult, McpWarmupServerResult } from './types.js'

/** OS / stdio 子进程要求 Record<string, string>；嵌套 JSON 存盘后在启动时 stringify */
function flattenMcpEnvForSpawn(env?: Record<string, unknown>): Record<string, string> {
  if (!env) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) continue
    if (typeof v === 'string') out[k] = v
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = String(v)
    else out[k] = JSON.stringify(v)
  }
  return out
}

/**
 * 使用一次性 MCP 客户端连接服务器并执行回调。
 *
 * @param entry - MCP 服务器配置
 * @param fn - 连接成功后的操作
 * @returns 回调返回值
 */
async function withMcpClient<T>(
  entry: McpServerEntry,
  fn: (client: Client) => Promise<T>
): Promise<T> {
  const transport = new StdioClientTransport({
    command: entry.command.trim(),
    args: entry.args ?? [],
    cwd: entry.cwd?.trim() || undefined,
    env: { ...getDefaultEnvironment(), ...flattenMcpEnvForSpawn(entry.env) },
    stderr: 'pipe'
  })
  const client = new Client({ name: 'openworker', version: '0.1.0' })
  await client.connect(transport)
  try {
    return await fn(client)
  } finally {
    await client.close()
  }
}

function safeMcpSegment(s: string): string {
  const t = s.trim().replace(/[^a-zA-Z0-9_-]/g, '_')
  return t.slice(0, 48) || 'srv'
}

/** 无 RPC 时关闭 stdio 子进程；新一轮 list/call 会重连 */
const MCP_POOL_IDLE_MS = 90_000
const PROBE_TIMEOUT_MS = 22_000
const MAX_MCP_INSTRUCTIONS_CHARS = 12_000
const MAX_MCP_PROMPTS_LIST = 40
const MAX_MCP_TOOLS_LIST = 60
const MAX_MCP_TOOL_DESC_CHARS = 400

function mcpLaunchSignature(entry: McpServerEntry): string {
  const flat = flattenMcpEnvForSpawn(entry.env)
  const envPart = Object.keys(flat)
    .sort()
    .map((k) => `${k}\u0001${flat[k]}`)
    .join('\u0002')
  return JSON.stringify({
    c: entry.command.trim(),
    a: entry.args ?? [],
    w: entry.cwd?.trim() ?? '',
    e: envPart
  })
}

function formatCallToolResult(result: unknown): string {
  if (!result || typeof result !== 'object') return String(result).slice(0, 24_000)
  const r = result as {
    content?: unknown[]
    isError?: boolean
  }
  const parts: string[] = []
  if (Array.isArray(r.content)) {
    for (const block of r.content) {
      if (block && typeof block === 'object' && 'type' in block) {
        const b = block as { type?: string; text?: string }
        if (b.type === 'text' && typeof b.text === 'string') parts.push(b.text)
        else parts.push(JSON.stringify(block))
      } else {
        parts.push(String(block))
      }
    }
  }
  let out = parts.join('\n').slice(0, 24_000)
  if (r.isError) out = `[MCP Tool Error] ${out}`
  return out || '(empty)'
}

type PooledSlot = {
  /** 启动签名；`command/args/cwd/env` 变化会丢弃旧连接并重连 */
  launchKey: string
  /** 已连接的 MCP 客户端 */
  client: Client
  /** 空闲定时器；空闲 `MCP_POOL_IDLE_MS` 后自动关闭子进程 */
  idleTimer: ReturnType<typeof setTimeout> | undefined
  /** 同一 stdio 会话上串行执行 MCP 请求，避免多工具并发打乱传输 */
  exclusiveTail: Promise<unknown>
}

type McpToolListItem = { name: string; description?: string | null }

/**
 * MCP 发现与连接生命周期：探测、预热、池化 stdio、收集服务器上下文。
 */
export class McpManager {
  private readonly pooledSlots = new Map<string, PooledSlot>()
  private readonly ensureTailByServer = new Map<string, Promise<unknown>>()

  /**
   * 一次性探测 MCP 服务器（列出工具），不入连接池。
   *
   * @param entry - MCP 服务器配置
   * @returns 探测结果
   */
  async probe(entry: McpServerEntry): Promise<McpProbeResult> {
    if (!entry.command?.trim()) {
      return { ok: false, error: 'command cannot be empty' }
    }
    const run = async (): Promise<McpProbeResult> => {
      return await withMcpClient(entry, async (client) => {
        const { tools } = await client.listTools()
        const list = (tools ?? []).map((t) => ({
          name: t.name,
          description: typeof t.description === 'string' ? t.description : undefined
        }))
        return { ok: true, tools: list }
      })
    }
    try {
      return await Promise.race([
        run(),
        new Promise<McpProbeResult>((_, reject) => {
          setTimeout(
            () => reject(new Error(`Probe timeout (>${PROBE_TIMEOUT_MS}ms)`)),
            PROBE_TIMEOUT_MS
          )
        })
      ])
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return { ok: false, error: message }
    }
  }

  /**
   * 对已启用的 MCP 逐个池化建连并 `listTools`：成功则连接留在池中供 Agent 复用（直至空闲超时）；
   * 失败则 `evict` 该 id，避免坏连接占位。
   *
   * @param servers - MCP 服务器列表（通常来自配置文件）
   * @returns 各服务器预热结果
   */
  async warmup(servers: McpServerEntry[]): Promise<McpWarmupServerResult[]> {
    const enabled = servers.filter((s) => s.enabled && s.command.trim())
    const out: McpWarmupServerResult[] = []
    for (const srv of enabled) {
      const run = async (): Promise<McpWarmupServerResult> => {
        try {
          const toolCount = await this.withPooledClient(srv, async (client) => {
            const { tools } = await client.listTools()
            return (tools ?? []).length
          })
          return { id: srv.id, name: srv.name, ok: true as const, toolCount }
        } catch (e) {
          await this.evict(srv.id)
          const message = e instanceof Error ? e.message : String(e)
          return {
            id: srv.id,
            name: srv.name,
            ok: false as const,
            error: message
          }
        }
      }
      try {
        const row = await Promise.race([
          run(),
          new Promise<McpWarmupServerResult>((_, reject) => {
            setTimeout(
              () => reject(new Error(`Warmup timeout (>${PROBE_TIMEOUT_MS}ms)`)),
              PROBE_TIMEOUT_MS
            )
          })
        ])
        out.push(row)
      } catch (e) {
        await this.evict(srv.id)
        const message = e instanceof Error ? e.message : String(e)
        out.push({ id: srv.id, name: srv.name, ok: false, error: message })
      }
    }
    return out
  }

  /**
   * 从配置文件加载服务器并执行预热。
   *
   * @param configPath - MCP 配置文件路径
   * @returns 各服务器预热结果
   */
  async warmupFromConfig(configPath: string): Promise<McpWarmupServerResult[]> {
    const servers = await loadMcpServersFromConfig(configPath)
    return this.warmup(servers)
  }

  /**
   * 关闭本实例全部池化 MCP 子进程（应用退出或宿主销毁时调用）。
   */
  async dispose(): Promise<void> {
    const snapshots = [...this.pooledSlots.values()]
    this.pooledSlots.clear()
    for (const slot of snapshots) {
      this.clearIdleTimer(slot)
      try {
        await slot.client.close()
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * 从池中移除并关闭指定 id 的 MCP（预热失败时避免留下半开连接）。
   *
   * @param serverId - 服务器条目 id
   */
  async evict(serverId: string): Promise<void> {
    const slot = this.pooledSlots.get(serverId)
    if (!slot) return
    await this.closeSlot(serverId, slot)
  }

  /**
   * 收集已启用 MCP 的 instructions / prompts / tools 索引，注入对话上下文。
   *
   * @param servers - MCP 服务器列表
   * @returns 合并后的 markdown 提示；无内容时为空串
   */
  async collectContextHints(servers: McpServerEntry[]): Promise<string> {
    const enabled = servers.filter((s) => s.enabled && s.command.trim())
    const blocks: string[] = []
    for (const srv of enabled) {
      try {
        await this.withPooledClient(srv, async (client) => {
          const block = await this.gatherClientHints(client, srv)
          if (block) blocks.push(block)
        })
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        mcpLog.warn(`[mcp] Failed to collect server hints ${srv.name} (${srv.id}): ${message}`)
      }
    }
    if (!blocks.length) return ''
    return `## MCP 服务器上下文（说明 / prompt / 工具索引）\n\n${blocks.join('\n\n---\n\n')}`
  }

  /**
   * 按 `McpServerEntry.id` 复用一条 stdio 连接；`command/args/cwd/env` 变化会丢弃旧连接并重连。
   * 空闲 `MCP_POOL_IDLE_MS` 后自动关闭子进程。探测接口仍用一次性 `withMcpClient`。
   *
   * @param entry - MCP 服务器配置
   * @param fn - 在池化客户端上执行的操作
   * @returns 回调返回值
   */
  async withPooledClient<T>(entry: McpServerEntry, fn: (client: Client) => Promise<T>): Promise<T> {
    const slot = await this.ensurePooledSlot(entry)
    try {
      return await this.runPooledExclusive(slot, () => fn(slot.client))
    } finally {
      const current = this.pooledSlots.get(entry.id)
      if (current === slot) this.scheduleIdleClose(entry.id, slot)
    }
  }

  /**
   * 在单次连接内收集 instructions / prompts / tools 索引。
   *
   * @param client - 已连接的 MCP 客户端
   * @param srv - 服务器条目
   * @param prelistedTools - 若已 listTools 则可传入，避免重复请求
   * @returns 单台服务器的 markdown 块；无内容时为空串
   */
  async gatherClientHints(
    client: Client,
    srv: McpServerEntry,
    prelistedTools?: McpToolListItem[]
  ): Promise<string> {
    const sections: string[] = []
    const instr = client.getInstructions()?.trim()
    if (instr) {
      sections.push(
        `**服务器说明**\n${instr.slice(0, MAX_MCP_INSTRUCTIONS_CHARS)}${instr.length > MAX_MCP_INSTRUCTIONS_CHARS ? '\n…（已截断）' : ''}`
      )
    }
    try {
      const { prompts } = await client.listPrompts()
      if (prompts?.length) {
        const lines = prompts.slice(0, MAX_MCP_PROMPTS_LIST).map((p) => {
          const desc = p.description?.trim()
          return `- \`${p.name}\`${desc ? ` — ${desc}` : ''}`
        })
        const more =
          prompts.length > MAX_MCP_PROMPTS_LIST
            ? `\n…另有 ${prompts.length - MAX_MCP_PROMPTS_LIST} 项未列出`
            : ''
        sections.push(
          [
            '**服务器已注册的 Prompt 模板（仅索引；调用 getPrompt 展开内容）**',
            `${lines.join('\n')}${more}`
          ].join('\n')
        )
      }
    } catch {
      // Servers without prompts capability will fail, ignore
    }
    let tools: McpToolListItem[] = prelistedTools ?? []
    if (!prelistedTools) {
      try {
        const { tools: listed } = await client.listTools()
        tools = (listed ?? []) as McpToolListItem[]
      } catch {
        tools = []
      }
    }
    if (tools.length) {
      const lines = tools.slice(0, MAX_MCP_TOOLS_LIST).map((t) => {
        const raw = t.description?.trim()
        const desc =
          raw && raw.length > MAX_MCP_TOOL_DESC_CHARS
            ? `${raw.slice(0, MAX_MCP_TOOL_DESC_CHARS)}…`
            : raw
        return `- \`${t.name}\`${desc ? ` — ${desc}` : ''}`
      })
      const more =
        tools.length > MAX_MCP_TOOLS_LIST
          ? `\n…另有 ${tools.length - MAX_MCP_TOOLS_LIST} 项未列出`
          : ''
      sections.push(
        [
          '**服务器已注册的工具（名称与描述；参数以宿主绑定工具的 schema 为准）**',
          `${lines.join('\n')}${more}`
        ].join('\n')
      )
    }
    if (!sections.length) return ''
    return `### ${srv.name}（id: ${srv.id}）\n${sections.join('\n\n')}`
  }

  /**
   * 为已启用的 MCP 服务器生成 Agent 工具（池化 stdio 连接，空闲自动断开）。
   *
   * 把各服务器 `listTools` 的结果编成 `defineTool`，执行时经本实例连接池 `callTool`。
   * 失败的服务器跳过并打日志，不中断其余服务器。
   *
   * @param servers - MCP 服务器列表
   * @param onTool - 工具生命周期观察回调
   * @returns 合并后的 ToolSet
   */
  async buildMcpTools(servers: McpServerEntry[], onTool: ToolOnTool): Promise<ToolSet> {
    const enabled = servers.filter((s) => s.enabled && s.command.trim())
    let toolSet: ToolSet = {}

    for (const srv of enabled) {
      try {
        await this.withPooledClient(srv, async (client) => {
          const { tools: listed } = await client.listTools()

          for (const t of listed ?? []) {
            const mcpToolName = t.name
            const mcpToolId = `mcp_${safeMcpSegment(srv.id)}__${safeMcpSegment(mcpToolName)}`

            toolSet = mergeToolSets(
              toolSet,
              defineTool(
                {
                  id: mcpToolId,
                  description: t.description?.trim(),
                  parameters: mcpInputSchemaToParameters(t.inputSchema),
                  execute: async (input) => {
                    const args = (
                      typeof input === 'object' && input !== null ? input : {}
                    ) as Record<string, unknown>
                    const result = await this.withPooledClient(srv, async (c) => {
                      return await c.callTool({
                        name: mcpToolName,
                        arguments: args
                      })
                    })
                    return formatCallToolResult(result)
                  }
                },
                onTool
              )
            )
          }
        })
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        mcpLog.warn(`[mcp] Skipping server ${srv.name} (${srv.id}): ${message}`)
      }
    }
    return toolSet
  }

  /**
   * 串行执行 MCP 请求，避免多工具并发打乱传输。
   *
   * @param serverId - 服务器 id
   * @param fn - 执行的函数
   * @returns 执行结果
   */
  private runEnsureSerialized<T>(serverId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.ensureTailByServer.get(serverId) ?? Promise.resolve()
    const p = prev.then(() => fn())
    this.ensureTailByServer.set(
      serverId,
      p.then(
        () => {},
        () => {}
      )
    )
    return p
  }

  private clearIdleTimer(slot: PooledSlot): void {
    if (slot.idleTimer !== undefined) {
      clearTimeout(slot.idleTimer)
      slot.idleTimer = undefined
    }
  }

  private async closeSlot(serverId: string, slot: PooledSlot): Promise<void> {
    this.clearIdleTimer(slot)
    if (this.pooledSlots.get(serverId) === slot) this.pooledSlots.delete(serverId)
    try {
      await slot.client.close()
    } catch (e) {
      mcpLog.warn(
        `[mcp-pool] Failed to close connection ${serverId}:`,
        e instanceof Error ? e.message : e
      )
    }
  }

  private scheduleIdleClose(serverId: string, slot: PooledSlot): void {
    this.clearIdleTimer(slot)
    slot.idleTimer = setTimeout(() => {
      slot.idleTimer = undefined
      if (this.pooledSlots.get(serverId) !== slot) return
      void this.closeSlot(serverId, slot)
    }, MCP_POOL_IDLE_MS)
  }

  /**
   * 按 `McpServerEntry.id` 复用一条 stdio 连接；`command/args/cwd/env` 变化会丢弃旧连接并重连。
   * 空闲 `MCP_POOL_IDLE_MS` 后自动关闭子进程。探测接口仍用一次性 `withMcpClient`。
   *
   * @param entry - MCP 服务器配置
   * @returns 已池化的 slot
   */
  private async ensurePooledSlot(entry: McpServerEntry): Promise<PooledSlot> {
    if (!entry.command?.trim()) throw new Error('command cannot be empty')
    return this.runEnsureSerialized(entry.id, async () => {
      const launchKey = mcpLaunchSignature(entry)
      const existing = this.pooledSlots.get(entry.id)
      if (existing && existing.launchKey === launchKey) {
        this.clearIdleTimer(existing)
        return existing
      }
      if (existing) await this.closeSlot(entry.id, existing)

      const transport = new StdioClientTransport({
        command: entry.command.trim(),
        args: entry.args ?? [],
        cwd: entry.cwd?.trim() || undefined,
        env: {
          ...getDefaultEnvironment(),
          ...flattenMcpEnvForSpawn(entry.env)
        },
        stderr: 'pipe'
      })
      const client = new Client({ name: 'openworker', version: '0.1.0' })
      await client.connect(transport)
      const slot: PooledSlot = {
        launchKey,
        client,
        idleTimer: undefined,
        exclusiveTail: Promise.resolve()
      }
      this.pooledSlots.set(entry.id, slot)
      return slot
    })
  }

  private runPooledExclusive<T>(slot: PooledSlot, fn: () => Promise<T>): Promise<T> {
    const run = slot.exclusiveTail.then(() => fn())
    slot.exclusiveTail = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }
}
