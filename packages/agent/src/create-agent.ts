/**
 * createAgent — 通用产品能力工厂：工作区工具、composerMode、plan 注入。
 * Skills / MCP 等产品约定由宿主经 resolveCapabilities 注入，本包不读约定路径。
 */

import type { LanguageModel, ToolSet } from 'ai'
import { createBaseAgent, type CoreMessage } from '@openworker/base-agent'
import { type AgentComposerMode, normalizeComposerMode } from '@openworker/shared'
import { mergeToolSets, type ToolObservation, type ToolOnTool } from '@openworker/tools'

import { buildApprovedPlanSystemSection } from './plan-artifact.js'
import { wrapToolExecuteForContext, wrapToolOnTool } from './tool-context.js'
import {
  buildWorkspaceRunPrompt,
  buildWorkspaceTools,
  type WorkspacePromptExtras
} from './workspace-tools.js'

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
 * 由宿主从应用设置等注入。
 */
export type AgentRunTavilyOptions = {
  /** Tavily API Key */
  apiKey?: string
}

/**
 * 解析本轮额外能力（工具与 prompt 片段）的上下文。
 */
export type ResolveAgentCapabilitiesContext = {
  composerMode: AgentComposerMode
  workspaceRoot: string
  onTool: ToolOnTool
}

/**
 * 宿主注入的本轮额外能力。
 */
export type AgentCapabilities = {
  tools?: ToolSet
  promptExtras?: WorkspacePromptExtras
}

/**
 * 创建期注入：send 时按 composerMode / 工作区解析额外 ToolSet 与 prompt。
 * 工具含 execute，不可经 AG-UI structuredClone。
 */
export type ResolveAgentCapabilities = (
  ctx: ResolveAgentCapabilitiesContext
) => Promise<AgentCapabilities>

/**
 * createAgent 配置项。
 *
 * provider 必填；messages / local 可选。工作区根须由 local.cwd 或 send.workspacePath 显式提供。
 *
 * @example
 * ```ts
 * const agent = createAgent({
 *   provider: model,
 *   messages: history,
 *   local: { cwd: '/path/to/workspace' }
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
  /** 本地运行环境；可选。cwd 缺省时须在 send 传入 workspacePath */
  local?: CreateAgentLocalOptions
  /** 本轮额外工具与 prompt；未传则仅工作区工具 */
  resolveCapabilities?: ResolveAgentCapabilities
}

/**
 * 单次 agent run 的可选参数（send 的第二参）。
 *
 * 调用形态：`send(userText, options?)`。
 * 可经 `tools` 传入宿主额外工具，与工作区工具 / resolveCapabilities 合并（同名时 tools 覆盖）。
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
   * 优先于 createAgent local.cwd；均未提供时抛错。
   */
  workspacePath?: string
  /**
   * Shell 命令隔离键。
   * 由宿主派生（如 `term:${sessionId}`）；缺省为 `term:default`。
   */
  terminalKey?: string
  /**
   * Tavily 联网搜索配置。
   * 由宿主注入；未配置有效 key 时不注册 web_search。
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
   */
  onTextRevoke?: () => void
  /**
   * 过程思考回调；可选。
   *
   * @param text - 本步完整思考文本
   * @param durationMs - 本步耗时（毫秒）
   */
  onThinking?: (text: string, durationMs?: number) => void
  /** 工具观察回调；可选，宿主可在此映射与收集工具时间线 */
  onTool?: (event: ToolObservation) => void
  /** 向宿主推送自定义事件（可选） */
  onEmit?: (event: unknown) => void
  /** 最大工具调用轮次 */
  maxSteps?: number
  /** 循环超时（毫秒） */
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
}

/** createAgent 未传 local 时的默认值 */
const DEFAULT_LOCAL: CreateAgentLocalOptions = {}

/**
 * 创建通用产品 agent 实例。
 *
 * 系统 prompt 在本函数内与工作区 prompt、宿主 extras、记忆段、批准计划合并。
 *
 * @param options - 创建配置；provider 必填
 * @returns 可 send 的 agent 实例
 */
export function createAgent(options: CreateAgentOptions): Agent {
  const local = options.local ?? DEFAULT_LOCAL
  const defaultCwd = local.cwd?.trim() || ''
  const defaultProvider = options.provider
  const resolveCapabilities = options.resolveCapabilities
  const inner = createBaseAgent(defaultCwd ? { cwd: defaultCwd } : {})
  if (options.messages) {
    inner.messages = options.messages
  }

  /**
   * 发起一次 agent run：合并工作区工具与宿主能力 → 委托 createBaseAgent.send。
   *
   * @param userText - 本轮用户文本
   * @param input - 可选 run 参数
   * @returns 运行结束后的 messages 与助手文本
   * @throws 消息为空、无工作区、运行失败或取消时抛出
   */
  async function send(userText: string, input: AgentRunInput = {}): Promise<AgentRunResult> {
    const trimmed = userText.trim()
    if (!trimmed) {
      throw new Error('userText is empty')
    }

    const onTool = wrapToolOnTool(input.onTool ?? (() => {}))
    const { maxSteps, invokeTimeoutMs, tools: hostTools } = input

    const composerMode = normalizeComposerMode(input.composerMode)
    const provider: LanguageModel = input.provider ?? defaultProvider
    const tavilyApiKey = input.tavily?.apiKey?.trim() || undefined

    const resolved = resolveCapabilities
      ? await resolveCapabilities({ composerMode, workspaceRoot: defaultCwd, onTool })
      : { tools: {}, promptExtras: {} }
    const extraTools = resolved.tools ?? {}
    const promptExtras = resolved.promptExtras ?? {}

    const workspaceTools = buildWorkspaceTools({
      root: defaultCwd,
      tavilyApiKey,
      onTool,
      mode: composerMode
    })
    const tools = wrapToolExecuteForContext(
      mergeToolSets(workspaceTools, extraTools, hostTools ?? {})
    )

    const basePrompt = buildWorkspaceRunPrompt(composerMode, defaultCwd, tavilyApiKey, promptExtras)
    const memorySection = input.memorySystemSection?.trim()
    const approvedPlanSection =
      composerMode === 'build' ? buildApprovedPlanSystemSection(input.planMarkdown ?? '') : ''
    const runPrompt = [basePrompt, memorySection, approvedPlanSection].filter(Boolean).join('\n\n')

    return inner.send(userText, {
      provider,
      abortController: input.abortController,
      messages: [{ role: 'system', content: runPrompt }, ...inner.messages],
      tools,
      toolsMode: 'replace',
      onTextDelta: input.onTextDelta,
      onTextRevoke: input.onTextRevoke,
      onThinking: input.onThinking,
      onTool,
      onEmit: input.onEmit,
      maxSteps,
      invokeTimeoutMs
    })
  }

  return {
    get messages() {
      return inner.messages
    },
    set messages(next) {
      inner.messages = next
    },
    send
  }
}
