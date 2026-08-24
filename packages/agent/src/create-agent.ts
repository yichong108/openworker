/**
 * createAgent 是包内底层工厂，由 OpenWorkerAgent 委托；宿主勿直接调用。
 * send 时按 `OPENWORKER_HOME` 加载 Skills / MCP，并在本文件内合并系统 prompt
 * （技能名摘要 / MCP 上下文）。
 */

import path from 'node:path'

import {
  type AgentComposerMode,
  type McpServerEntry,
  normalizeComposerMode
} from '@openworker/shared'
import { getOpenworkerMcpConfigPath } from '@openworker/shared/load-env'
import { getSingleSkillManager } from './single-skill-manager.js'
import type { LanguageModel, ToolSet } from 'ai'

import {
  buildMcpToolsFromConfig,
  disposeMcpConnectionPool,
  probeMcpServer,
  warmupMcpServersFromConfig
} from './mcp/mcp-runtime.js'
import type { McpProbeResult, McpWarmupServerResult } from './mcp/types.js'
import {
  contentToText,
  findLastAssistantMessage,
  runReactLoop,
  type CoreMessage,
  userMessage
} from '@openworker/base-agent'
import { buildApprovedPlanSystemSection } from './plan-artifact.js'
import { formatToolResultForContext, wrapToolOnTool } from './tool-context.js'
import { mergeToolSets, type ToolObservation, type ToolOnTool } from '@openworker/tools'
import {
  buildWorkspaceRunPrompt,
  buildWorkspaceTools,
  type WorkspacePromptExtras
} from './workspace-tools.js'
export { getOpenworkerDir, getOpenworkerMcpConfigPath } from '@openworker/shared/load-env'

/**
 * createAgent 本地运行环境配置。
 */
export type CreateAgentLocalOptions = {
  /** 工作区根目录；send 时若未指定 workspacePath 则使用此值 */
  cwd?: string
}

/**
 * 单次 run 的 Tavily 联网搜索配置。
 *
 * 由宿主从应用设置等注入；未传或无有效 key 时，仍可读环境变量 TAVILY_API_KEY。
 */
export type AgentRunTavilyOptions = {
  /** Tavily API Key */
  apiKey?: string
}

/**
 * Agent 上的 MCP 宿主能力（探测 / 预热 / 释放连接池）。
 *
 * 与 send 内部按约定加载 MCP 独立：工具绑定在 send 内完成；本对象供宿主管理连接池。
 * 实现细节不单独从包根导出。
 */
export type AgentMcp = {
  /** 一次性探测单个 MCP 服务器（不入池） */
  probe: (entry: McpServerEntry) => Promise<McpProbeResult>
  /**
   * 按 configPath 预热已启用的 MCP（池化建连）。
   * 未传时使用 `~/.openworker/mcp.json`。
   */
  warmup: (configPath?: string) => Promise<McpWarmupServerResult[]>
  /** 关闭所有池化 MCP 子进程（设置变更或应用退出时调用） */
  dispose: () => Promise<void>
}

/**
 * createAgent 配置项。
 *
 * provider 必填；messages / local 可选（messages 默认 []，cwd 回退 process.cwd()）。
 * Skills / MCP 在 send 时按 `~/.openworker` 约定自动加载，不在 create 时绑定。
 *
 * @example
 * ```ts
 * const agent = createAgent({
 *   provider: model,
 *   messages: history,
 *   local: { cwd: process.cwd() }
 * })
 * await agent.send('hi', { composerMode: 'build' })
 * ```
 */
export type CreateAgentOptions = {
  /** AI SDK LanguageModel；创建时必填，send 未传 provider 时作为本轮对话模型 */
  provider: LanguageModel
  /**
   * 会话消息初始值；由 agent 持有。
   * 可选，默认 []。send 会追加本轮用户消息并在结束后写回完整轨迹，以支持连续 send。
   */
  messages?: CoreMessage[]
  /** 本地运行环境；可选，默认 {}，cwd 缺省时回退 process.cwd() */
  local?: CreateAgentLocalOptions
}

/**
 * 单次 agent run 的可选参数（send 的第二参）。
 *
 * 调用形态：`send(userText, options?)`。
 * 会话历史由 createAgent / agent.messages 持有；send 内部追加 userText 并写回。
 * Skills / MCP 由 send 内部从 `~/.agents/skills`、工作区 `.agents/skills` 与 `~/.openworker/mcp.json` 加载；
 * 可经 `tools` 传入宿主额外工具，与 skills / MCP / 工作区工具合并（同名时 tools 覆盖）。
 * 回调均为可选，未传时使用空操作。
 * 工具时间线（ToolTimelineEvent）由宿主在 onTool 中自行映射与收集。
 */
export type AgentRunInput = {
  /**
   * 发送模式；可选，默认 build（非法值亦回退 build）。
   */
  composerMode?: AgentComposerMode
  /**
   * 本轮已解析的聊天模型。
   * 可选；未传时回退 createAgent 时注入的 provider。
   */
  provider?: LanguageModel
  /**
   * 取消控制器；可选，未传时内部新建 AbortController。
   * 宿主若需外部取消（如 Stop），应自行传入并持有引用。
   */
  abortController?: AbortController
  /**
   * 本轮工作区根目录绝对路径。
   * 优先于 createAgent local.cwd；均未提供时回退 process.cwd()。
   */
  workspacePath?: string
  /**
   * Shell 命令隔离键。
   * 由宿主派生（如 `term:${sessionId}`）；缺省为 `term:default`。
   * sessionId / runId / traceId 不进入 agent，由宿主在回调外维护。
   */
  terminalKey?: string
  /**
   * Tavily 联网搜索配置。
   * 由宿主注入；未配置有效 key 且无环境变量时不注册 web_search。
   */
  tavily?: AgentRunTavilyOptions
  /**
   * 本轮宿主额外工具（AI SDK ToolSet）；可选。
   * 与工作区内置工具合并；同名时覆盖工作区工具。
   */
  tools?: ToolSet
  /**
   * 流式文本增量回调；可选。
   * 每步生成时都会增量触发；若本步最终伴有 tool calls，随后会调用 `onTextRevoke` 撤回。
   */
  onTextDelta?: (text: string) => void
  /**
   * 撤回本步已通过 `onTextDelta` 流出的 Result 文本；可选。
   * 在工具步转入 `onThinking` 之前调用，避免过程叙述留在最终回答区。
   */
  onTextRevoke?: () => void
  /**
   * 过程思考回调；可选。
   * ReAct 中间步（本步伴随 tool calls）的叙述文本走此通道，供宿主映射为 Worked → Thought。
   *
   * @param text - 本步完整思考文本
   * @param durationMs - 本步耗时（毫秒）
   */
  onThinking?: (text: string, durationMs?: number) => void
  /** 工具观察回调；可选，宿主可在此映射与收集工具时间线 */
  onTool?: (event: ToolObservation) => void
  /** 向宿主推送自定义事件（可选；桌面侧经 AG-UI CUSTOM 转发） */
  onEmit?: (event: unknown) => void
  /** 最大工具调用轮次；缺省时使用 MAX_AGENT_LOOP_STEPS */
  maxSteps?: number
  /** 循环超时（毫秒）；缺省时使用 defaultSettings.agentRunTimeoutMs */
  invokeTimeoutMs?: number
  /**
   * 会话记忆压缩段落（由宿主 / @openworker/memory 生成）。
   * 拼在工作区 system prompt 之后；空串或未传则忽略。
   */
  memorySystemSection?: string
  /**
   * 用户已批准的实施计划 Markdown（Build 执行阶段注入）。
   * 拼在 system prompt 末尾；空串或未传则忽略。仅在 composerMode=build 时生效。
   */
  planMarkdown?: string
}

/**
 * 单次 agent run 的结果。
 */
export type AgentRunResult = {
  /** 本轮结束后的完整消息轨迹 */
  messages: CoreMessage[]
  /** 最终助手文本；无助手回复时为空串 */
  result: string
}

/**
 * createAgent 返回的 agent 实例。
 */
export type Agent = {
  /**
   * 当前会话消息；创建时来自 CreateAgentOptions.messages。
   * send 会追加本轮用户消息，成功后写回含助手回复的完整轨迹，可直接再 send。
   */
  messages: CoreMessage[]
  /**
   * 发起一次 run：`send(userText, options?)`。
   * 内部更新 messages；同会话互斥由宿主保证，不同会话可并行。
   */
  send: (userText: string, input?: AgentRunInput) => Promise<AgentRunResult>
  /** MCP 宿主侧能力（probe / warmup / dispose）；与 send 内部 MCP 加载独立 */
  mcp: AgentMcp
}

/** createAgent 未传 local 时的默认值；cwd 缺省时在 send 侧回退 process.cwd() */
const DEFAULT_LOCAL: CreateAgentLocalOptions = {}

/**
 * 从 messages 提取最后一条助手文本。
 *
 * @param messages - 本轮结束后的 CoreMessage 列表
 * @returns 助手纯文本；无则空串
 */
function extractAssistantText(messages: CoreMessage[]): string {
  const last = findLastAssistantMessage(messages)
  return last ? contentToText(last.content) : ''
}

/**
 * 按约定加载本轮 Skills / MCP 工具与 prompt 增强片段。
 *
 * ask / plan 模式下跳过（不暴露 readSkill* / mcp_*，也不注入技能名摘要）。
 * 目录或文件不存在时加载结果为空，不抛错。
 *
 * @param composerMode - 发送模式
 * @param workspaceRoot - 工作区根目录（用于 project skills 路径）
 * @param onTool - 工具生命周期观察回调
 * @returns 合并后的额外 ToolSet 与注入 system prompt 的 extras
 */
async function loadSkillsAndMcpTools(
  composerMode: AgentComposerMode,
  workspaceRoot: string,
  onTool: ToolOnTool
): Promise<{ tools: ToolSet; promptExtras: WorkspacePromptExtras }> {
  if (composerMode === 'ask' || composerMode === 'plan') {
    return { tools: {}, promptExtras: {} }
  }

  const skillManager = getSingleSkillManager()
  await skillManager.init(onTool)
  await skillManager.addSkillRootDir('project', path.join(workspaceRoot, '.agents', 'skills'))
  const skillBundle = skillManager.toPromptAndTools()
  const mcpResult = await buildMcpToolsFromConfig(getOpenworkerMcpConfigPath(), onTool)

  const promptExtras: WorkspacePromptExtras = {
    ...(skillBundle.hint ? { skillHint: skillBundle.hint } : {})
  }

  if (mcpResult.servers.length > 0) {
    const enabled = mcpResult.servers.filter((s) => s.enabled && s.command.trim())
    promptExtras.mcpContextHints = mcpResult.contextHints
    promptExtras.includeMcpMeta = true
    promptExtras.enabledMcpNames = enabled.map((s) => s.name || s.id)
    promptExtras.hasDisabledMcpEntries = enabled.length === 0
  } else if (mcpResult.contextHints) {
    promptExtras.mcpContextHints = mcpResult.contextHints
  }

  return {
    tools: mergeToolSets(skillBundle.tools, mcpResult.tools),
    promptExtras
  }
}

/**
 * 创建 agent 实例 — packages/agent 的唯一入口工厂。
 *
 * skills / mcp 在 send 时从 `~/.openworker` 加载；系统 prompt 在本函数内与工作区 prompt 合并。
 * 可 `await createAgent(...)`（函数本身同步，await 无害）。
 *
 * 注意：不直接与外部耦合。同会话「运行中不可再发」由宿主按 session 互斥；
 * 不同会话各自独立 send，互不排队。
 *
 * @param options - 创建配置；provider 必填，messages / local 有默认值
 * @returns 可 send / mcp 的 agent 实例
 */
export function createAgent(options: CreateAgentOptions): Agent {
  const local = options.local ?? DEFAULT_LOCAL
  const defaultCwd = local.cwd?.trim() || process.cwd()
  const defaultProvider = options.provider
  /** 会话消息由 agent 持有；初始值来自 options.messages */
  let messages: CoreMessage[] = [...(options.messages ?? [])]

  /**
   * 发起一次 agent run：加载 skills / MCP → 合并系统 prompt → ReAct 循环。
   *
   * @param userText - 本轮用户文本
   * @param input - 可选 run 参数（不含 skills / mcp 路径配置）
   * @returns 运行结束后的 messages 与助手文本
   * @throws 消息为空、运行失败或取消时抛出
   */
  async function send(userText: string, input: AgentRunInput = {}): Promise<AgentRunResult> {
    const trimmed = userText.trim()
    if (!trimmed) {
      throw new Error('userText is empty')
    }

    const onTextDelta = input.onTextDelta ?? (() => {})
    const onTextRevoke = input.onTextRevoke ?? (() => {})
    const onThinking = input.onThinking ?? (() => {})
    const onTool = wrapToolOnTool(input.onTool ?? (() => {}))
    const { maxSteps, invokeTimeoutMs, tools: hostTools } = input

    // 追加本轮用户消息并立即写回，保证连续 send / 失败重试时历史连贯
    const inputMessages = [...messages, userMessage(trimmed)]
    messages = inputMessages

    const composerMode = normalizeComposerMode(input.composerMode)
    const provider: LanguageModel = input.provider ?? defaultProvider
    const abortController = input.abortController ?? new AbortController()
    const root = input.workspacePath?.trim() || defaultCwd
    const tavilyApiKey = input.tavily?.apiKey?.trim() || undefined

    const { tools: extraTools, promptExtras } = await loadSkillsAndMcpTools(
      composerMode,
      root,
      onTool
    )

    const workspaceTools = buildWorkspaceTools({
      root,
      tavilyApiKey,
      onTool,
      mode: composerMode
    })
    const tools = mergeToolSets(workspaceTools, extraTools, hostTools ?? {})

    // 在 create-agent 内合并系统 prompt（工作区 + skills 名称摘要 + MCP 上下文 + 可选记忆段 + 批准计划）
    const basePrompt = buildWorkspaceRunPrompt(composerMode, root, tavilyApiKey, promptExtras)
    const memorySection = input.memorySystemSection?.trim()
    const approvedPlanSection =
      composerMode === 'build' ? buildApprovedPlanSystemSection(input.planMarkdown ?? '') : ''
    const runPrompt = [basePrompt, memorySection, approvedPlanSection].filter(Boolean).join('\n\n')

    const runMessages = await runReactLoop(
      provider,
      runPrompt,
      inputMessages,
      tools,
      abortController,
      onTextDelta,
      maxSteps,
      invokeTimeoutMs,
      onThinking,
      onTextRevoke,
      formatToolResultForContext
    )

    const finalMessages = runMessages.length > 0 ? runMessages : inputMessages
    messages = finalMessages
    return {
      messages: finalMessages,
      result: extractAssistantText(finalMessages)
    }
  }

  const mcpApi: AgentMcp = {
    probe: (entry) => probeMcpServer(entry),
    warmup: (configPath) =>
      warmupMcpServersFromConfig((configPath?.trim() || getOpenworkerMcpConfigPath()).trim()),
    dispose: () => disposeMcpConnectionPool()
  }

  return {
    get messages() {
      return messages
    },
    set messages(next) {
      messages = [...next]
    },
    send,
    mcp: mcpApi
  }
}
