/**
 * createBaseAgent 是基于 ReAct 循环的最小 agent 入口工厂。
 * 仅提供 shell 工具，不含 fs / grep / skills / MCP 等增强能力。
 */

import type { LanguageModel, ToolSet } from 'ai'

import { buildShellTool, type ToolObservation } from '@openworker/tools'
import {
  contentToText,
  findLastAssistantMessage,
  userMessage,
  type CoreMessage
} from './messages.js'
import { runReActLoop } from './react-loop.js'

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
 * 从历史中分出 system 消息与会话消息。
 *
 * system 文本拼接为本轮 prompt；空内容的 system 忽略。
 * 写回的轨迹不含 system，避免与顶层 systemPrompt 重复。
 *
 * @param history - 本轮起点消息（可能含 system）
 * @returns 抽出的 prompt（无则 undefined）与不含 system 的会话历史
 */
function splitSystemMessages(history: CoreMessage[]): {
  systemPrompt: string | undefined
  conversation: CoreMessage[]
} {
  const systemParts: string[] = []
  const conversation: CoreMessage[] = []
  for (const msg of history) {
    if (msg.role === 'system') {
      const text = contentToText(msg.content).trim()
      if (text) systemParts.push(text)
      continue
    }
    conversation.push(msg)
  }
  return {
    systemPrompt: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
    conversation
  }
}

/**
 * createBaseAgent 配置项。
 *
 * cwd 可选，缺省时在 send 侧回退 process.cwd()。provider / messages 在 send 的 BaseAgentSendOptions 中传入。
 *
 * @example
 * ```ts
 * const agent = createBaseAgent({ cwd: process.cwd() })
 * await agent.send('hi', { provider: model, messages: history })
 * ```
 */
export type CreateBaseAgentOptions = {
  /** 工作区根目录；缺省回退 process.cwd() */
  cwd?: string
}

/**
 * 单次 send 的参数。
 */
export type BaseAgentSendOptions = {
  /** AI SDK LanguageModel；本轮对话模型，必填 */
  provider: LanguageModel
  /**
   * 本轮会话历史；可选。
   * 传入时作为本轮起点（覆盖 agent 当前 messages）；未传则使用 agent 持有的 messages。
   * send 会追加本轮用户消息并在结束后写回完整轨迹，以支持连续 send。
   * 其中 `role: 'system'` 的消息会抽出作为本轮 system prompt，不进入会话轨迹。
   */
  messages?: CoreMessage[]
  /**
   * 取消控制器；可选，未传时内部新建 AbortController。
   * 宿主若需外部取消（如 Stop），应自行传入并持有引用。
   */
  abortController?: AbortController
  /**
   * 本轮工具（AI SDK ToolSet）；可选。
   * 传入时作为完整工具集（调用方需自行包含 shell）；未传则仅注册内置 shell。
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
  /** 最大工具调用轮次；缺省由 runReActLoop 决定 */
  maxSteps?: number
  /** 循环超时（毫秒）；缺省由 runReActLoop 决定 */
  invokeTimeoutMs?: number
}

/**
 * 单次 send 的结果。
 */
export type BaseAgentSendResult = {
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
   * 当前会话消息；初始为 []，也可由 send 的 input.messages 覆盖。
   * send 会追加本轮用户消息，成功后写回含助手回复的完整轨迹，可直接再 send。
   */
  messages: CoreMessage[]
  /**
   * 发起一次 run：`send(userText, input)`。
   * 内部更新 messages；同会话互斥由宿主保证，不同会话可并行。
   */
  send: (userText: string, input: BaseAgentSendOptions) => Promise<BaseAgentSendResult>
}

/**
 * 创建仅含 ReAct 循环与 shell 工具的最小 agent 实例。
 *
 * @param options - 创建配置；cwd 可选
 * @returns 可 send 的 agent 实例
 */
export function createBaseAgent(options: CreateBaseAgentOptions = {}): BaseAgent {
  const cwd = options.cwd?.trim() || process.cwd()
  let messages: CoreMessage[] = []

  /**
   * 发起一次 agent run：追加用户消息 → 组装工具与 prompt → ReAct 循环。
   *
   * @param userText - 本轮用户文本
   * @param input - run 参数（provider 必填；messages / 回调 / 超时等可选）
   * @returns 运行结束后的 messages 与助手文本
   * @throws 消息为空、运行失败或取消时抛出
   */
  async function send(userText: string, input: BaseAgentSendOptions): Promise<BaseAgentSendResult> {
    const trimmed = userText.trim()
    if (!trimmed) {
      throw new Error('userText is empty')
    }

    const onTextDelta = input.onTextDelta ?? (() => {})
    const onTextRevoke = input.onTextRevoke ?? (() => {})
    const onThinking = input.onThinking ?? (() => {})
    const onTool = input.onTool ?? (() => {})
    const { maxSteps, invokeTimeoutMs } = input

    // 构建历史：system 抽出为 prompt，不进入会话轨迹
    const history = input.messages != null ? [...input.messages] : [...messages]
    const { systemPrompt: extractedPrompt, conversation } = splitSystemMessages(history)
    const inputMessages = [...conversation, userMessage(trimmed)]
    messages = inputMessages

    // 构建模型
    const provider = input.provider

    // 取消控制器
    const abortController = input.abortController ?? new AbortController()

    // 未传 tools 时仅内置 shell；传入则为完整工具集
    const tools: ToolSet =
      input.tools != null
        ? input.tools
        : buildShellTool({
            root: cwd,
            onTool: onTool
          })

    const systemPrompt =
      extractedPrompt ??
      `You are a helpful assistant that can help with tasks in the workspace at ${cwd}.`

    const runMessages = await runReActLoop({
      model: provider,
      systemPrompt,
      messages: inputMessages,
      tools,
      abortController,
      onToken: onTextDelta,
      maxSteps,
      timeoutMs: invokeTimeoutMs,
      onThinking,
      onTextRevoke
    })

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
