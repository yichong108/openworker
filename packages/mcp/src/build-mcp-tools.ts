/**
 * 把 MCP 服务器工具编成 Agent ToolSet（defineTool + 池化 callTool）。
 */

import type { McpServerEntry } from '@openworker/shared'
import { defineTool, mergeToolSets, type ToolOnTool, type ToolSet } from '@openworker/tools'
import { z } from 'zod'

import { loadMcpServersFromConfig } from './load-config.js'
import { mcpLog } from './logger.js'
import type { McpManager } from './mcp-manager.js'

function safeMcpSegment(s: string): string {
  const t = s.trim().replace(/[^a-zA-Z0-9_-]/g, '_')
  return t.slice(0, 48) || 'srv'
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

function truncateSchema(schema: unknown, max = 1800): string {
  try {
    const s = JSON.stringify(schema)
    if (s.length <= max) return s
    return `${s.slice(0, max)}…`
  } catch {
    return ''
  }
}

/** buildMcpTools 的返回值 */
export type BuildMcpToolsResult = {
  tools: ToolSet
  contextHints: string
  /** 参与构建的完整服务器列表（含未启用），供 prompt 元信息使用 */
  servers: McpServerEntry[]
}

/**
 * 为已启用的 MCP 服务器生成 Agent 工具（池化 stdio 连接，空闲自动断开）。
 *
 * @param servers - MCP 服务器列表
 * @param onTool - 工具生命周期观察回调
 * @param manager - 连接池与发现实例（由宿主传入，通常为进程级单例）
 * @returns ToolSet、上下文提示与原始服务器列表
 */
export async function buildMcpTools(
  servers: McpServerEntry[],
  onTool: ToolOnTool,
  manager: McpManager
): Promise<BuildMcpToolsResult> {
  const enabled = servers.filter((s) => s.enabled && s.command.trim())
  const toolSets: ToolSet[] = []
  const hintBlocks: string[] = []

  for (const srv of enabled) {
    try {
      await manager.withPooledClient(srv, async (client) => {
        const { tools: listed } = await client.listTools()
        const hint = await manager.gatherClientHints(client, srv, listed ?? [])
        if (hint) hintBlocks.push(hint)
        let idx = 0
        for (const t of listed ?? []) {
          const mcpToolName = t.name
          const baseLc = `mcp_${safeMcpSegment(srv.id)}__${safeMcpSegment(mcpToolName)}`
          const lcName = `${baseLc}_${idx}`
          idx += 1
          const schemaHint = t.inputSchema ? truncateSchema(t.inputSchema) : ''
          const descParts = [
            t.description?.trim() || `MCP 工具 ${mcpToolName}`,
            `服务器：${srv.name}（stdio）`,
            schemaHint ? `inputSchema：${schemaHint}` : ''
          ].filter(Boolean)

          toolSets.push(
            defineTool(
              {
                id: lcName,
                description: descParts.join('\n'),
                parameters: z.looseObject({}),
                execute: async (input) => {
                  const args = (typeof input === 'object' && input !== null ? input : {}) as Record<
                    string,
                    unknown
                  >
                  const result = await manager.withPooledClient(srv, async (c) => {
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
  const contextHints = hintBlocks.length
    ? `## MCP 服务器上下文（说明 / prompt / 工具索引）\n\n${hintBlocks.join('\n\n---\n\n')}`
    : ''
  return { tools: mergeToolSets(...toolSets), contextHints, servers }
}

/**
 * 从配置文件加载 MCP 并生成 Agent 工具。
 *
 * @param configPath - MCP 配置文件路径
 * @param onTool - 工具生命周期观察回调
 * @param manager - 连接池与发现实例
 * @returns 工具列表、上下文提示与服务器列表
 */
export async function buildMcpToolsFromConfig(
  configPath: string,
  onTool: ToolOnTool,
  manager: McpManager
): Promise<BuildMcpToolsResult> {
  const servers = await loadMcpServersFromConfig(configPath)
  return buildMcpTools(servers, onTool, manager)
}

/** @deprecated 使用 buildMcpTools */
export const buildMcpLangChainTools = buildMcpTools
