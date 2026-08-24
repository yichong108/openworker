/**
 * createBaseAgent 是基于 ReAct 循环的最小 agent 入口工厂。
 * 仅提供 shell 工具，不含 fs / grep / skills / MCP 等增强能力。
 */

import type { LanguageModel, ToolSet } from 'ai'

import {
  buildShellRunPrompt,
  buildShellTool,
  mergeToolSets,
  type ToolObservation,
  type ToolOnTool
} from '@openworker/tools'
import {
  contentToText,
  findLastAssistantMessage,
  userMessage,
  type CoreMessage
} from './messages.js'
import { runReactLoop } from './react-loop.js'

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
 * 工具准备阶段产物：ReAct 可用工具与 system prompt。
 */
type PreparedTooling = {
  tools: ToolSet
  runPrompt: string
}

/**
 * createBaseAgent 本地运行环境配置。
 */
export type CreateBaseAgentLocalOptions = {
  /** 工作区根目录；send 时若未指定 workspacePath 则使用此值 */
  cwd?: string
}

/** createBaseAgent 未传 local 时的默认值；cwd 缺省时在 send 侧回退 process.cwd() */
const DEFAULT_LOCAL: CreateBaseAgentLocalOptions = {}

/**
 * createBaseAgent 配置项。
 *
 * provider 必填；messages / local 可选（messages 默认 []，cwd 回退 process.cwd()）。
 *
 * @example
 * ```ts
 * const agent = createBaseAgent({
 *   provider: model,
 *   messages: history,
 *   local: { cwd: process.cwd() }
 * })
 * ```
 */
export type CreateBaseAgentOptions = {
  /** AI SDK LanguageModel；创建时必填，send 未传 provider 时作为本轮对话模型 */
  provider: LanguageModel
  /**
   * 会话消息初始值；由 agent 持有。
   * 可选，默认 []。send 会追加本轮用户消息并在结束后写回完整轨迹，以支持连续 send。
   */
  messages?: CoreMessage[]
  /** 本地运行环境；可选，默认 {}，cwd 缺省时回退 process.cwd() */
  local?: CreateBaseAgentLocalOptions
}

/**
 * 单次 base agent run 的可选参数（send 的第二参）。
 */
export type BaseAgentRunInput = {
  /**
   * 本轮已解析的聊天模型。
   * 可选；未传时回退 createBaseAgent 时注入的 provider。
   */
  provider?: LanguageModel
  /**
   * 取消控制器；可选，未传时内部新建 AbortController。
   * 宿主若需外部取消（如 Stop），应自行传入并持有引用。
   */
  abortController?: AbortController
  /**
   * 本轮工作区根目录绝对路径。
   * 优先于 createBaseAgent local.cwd；均未提供时回退 process.cwd()。
   */
  workspacePath?: string
  /**
   * Shell 命令隔离键。
   * 由宿主派生（如 `term:${sessionId}`）；缺省为 `term:default`。
   */
  terminalKey?: string
  /**
   * 本轮宿主额外工具（AI SDK ToolSet）；可选。
   * 与 shell 工具合并；同名时覆盖 shell 工具。
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
  /** 最大工具调用轮次；缺省时使用 MAX_AGENT_LOOP_STEPS */
  maxSteps?: number
  /** 循环超时（毫秒）；缺省时使用 defaultSettings.agentRunTimeoutMs */
  invokeTimeoutMs?: number
}

/**
 * 单次 base agent run 的结果。
 */
export type BaseAgentRunResult = {
  /** 本轮结束后的完整消息轨迹 */
  messages: CoreMessage[]
  /** 最终助手文本；无助手回复时为空串 */
  result: string
}

/**
 * createBaseAgent 返回的 agent 实例。
 */
export type BaseAgent = {
  /**
   * 当前会话消息；创建时来自 CreateBaseAgentOptions.messages。
   * send 会追加本轮用户消息，成功后写回含助手回复的完整轨迹，可直接再 send。
   */
  messages: CoreMessage[]
  /**
   * 发起一次 run：`send(userText, options?)`。
   * 内部更新 messages；同会话互斥由宿主保证，不同会话可并行。
   */
  send: (userText: string, input?: BaseAgentRunInput) => Promise<BaseAgentRunResult>
}

/**
 * 创建仅含 ReAct 循环与 shell 工具的最小 agent 实例。
 *
 * @param options - 创建配置；provider 必填，messages / local 有默认值
 * @returns 可 send 的 agent 实例
 */
export function createBaseAgent(options: CreateBaseAgentOptions): BaseAgent {
  const local = options.local ?? DEFAULT_LOCAL
  const defaultCwd = local.cwd?.trim() || process.cwd()
  const defaultProvider = options.provider
  let messages: CoreMessage[] = [...(options.messages ?? [])]

  /**
   * 组装本轮工具与 system prompt：shell 工具 + 本轮可选 tools。
   */
  async function prepareTooling(args: {
    root: string
    tools?: ToolSet
    onTool: ToolOnTool
  }): Promise<PreparedTooling> {
    const shellTools = buildShellTool({
      root: args.root,
      onTool: args.onTool
    })

    return {
      tools: mergeToolSets(shellTools, args.tools ?? {}),
      runPrompt: buildShellRunPrompt(args.root)
    }
  }

  /**
   * 发起一次 agent run：追加用户消息 → 组装工具与 prompt → ReAct 循环。
   *
   * @param userText - 本轮用户文本
   * @param input - 可选 run 参数（回调、超时等）
   * @returns 运行结束后的 messages 与助手文本
   * @throws 消息为空、运行失败或取消时抛出
   */
  async function send(
    userText: string,
    input: BaseAgentRunInput = {}
  ): Promise<BaseAgentRunResult> {
    const trimmed = userText.trim()
    if (!trimmed) {
      throw new Error('userText is empty')
    }

    const onTextDelta = input.onTextDelta ?? (() => {})
    const onTextRevoke = input.onTextRevoke ?? (() => {})
    const onThinking = input.onThinking ?? (() => {})
    const onTool = input.onTool ?? (() => {})
    const { maxSteps, invokeTimeoutMs } = input

    const inputMessages = [...messages, userMessage(trimmed)]
    messages = inputMessages

    const provider = input.provider ?? defaultProvider
    const abortController = input.abortController ?? new AbortController()
    const root = input.workspacePath?.trim() || defaultCwd

    const tooling = await prepareTooling({
      root,
      tools: input.tools,
      onTool
    })

    const runMessages = await runReactLoop(
      provider,
      tooling.runPrompt,
      inputMessages,
      tooling.tools,
      abortController,
      onTextDelta,
      maxSteps,
      invokeTimeoutMs,
      onThinking,
      onTextRevoke
    )

    const finalMessages = runMessages.length > 0 ? runMessages : inputMessages
    messages = finalMessages
    return {
      messages: finalMessages,
      result: extractAssistantText(finalMessages)
    }
  }

  return {
    get messages() {
      return messages
    },
    set messages(next: CoreMessage[]) {
      messages = [...next]
    },
    send
  }
}
