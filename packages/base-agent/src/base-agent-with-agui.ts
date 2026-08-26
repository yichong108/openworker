/**
 * BaseAgentWithAGUI：将 createBaseAgent 桥接为 AG-UI AbstractAgent。
 *
 * 导出形态与官方集成一致：继承 `AbstractAgent`，`run(input)` 返回 `Observable<BaseEvent>`，
 * 可直接用于 CopilotKit / HttpAgent 服务端或 `runAgent()` 客户端管线。
 */

import {
  AbstractAgent,
  EventType,
  randomUUID,
  type AgentConfig,
  type BaseEvent,
  type CustomEvent,
  type Message,
  type RunAgentInput,
  type RunAgentParameters,
  type RunErrorEvent,
  type RunFinishedEvent,
  type RunStartedEvent,
  type TextMessageContentEvent,
  type TextMessageEndEvent,
  type TextMessageStartEvent,
  type ToolCallArgsEvent,
  type ToolCallEndEvent,
  type ToolCallResultEvent,
  type ToolCallStartEvent
} from '@ag-ui/client'
import type { ToolModelMessage, ToolResultPart } from 'ai'
import { Observable, type Subscriber } from 'rxjs'

import {
  createBaseAgent,
  type BaseAgent,
  type BaseAgentSendOptions,
  type CreateBaseAgentOptions
} from './create-base-agent.js'
import type { CoreMessage } from './messages.js'
import type { ToolObservation } from '@openworker/tools'

/**
 * 每轮 createBaseAgent.send 的默认参数（不含流式回调；回调由本适配器映射为 AG-UI 事件）。
 *
 * 注意：经 `runAgent({ forwardedProps })` 传入时，AG-UI 会对 forwardedProps 做
 * `structuredClone`。`provider`（LanguageModel，含 url 等函数）与 `abortController`
 * 不可克隆，BaseAgentWithAGUI 会在克隆前剥离并在本轮 run 中合并回 send 选项。
 */
export type BaseAgentWithAGUIRunDefaults = Partial<
  Omit<BaseAgentSendOptions, 'onTextDelta' | 'onTextRevoke' | 'onThinking' | 'onTool' | 'onEmit'>
>

/**
 * BaseAgentWithAGUI 配置：AG-UI AgentConfig + createBaseAgent 选项。
 */
export type CreateBaseAgentWithAGUIOptions = AgentConfig & {
  /** createBaseAgent 配置（cwd 可选） */
  baseAgent?: CreateBaseAgentOptions
  /**
   * 每轮 send 的默认参数。
   * 优先级：runDefaults < 克隆前剥离的 extras < RunAgentInput.forwardedProps
   */
  runDefaults?: BaseAgentWithAGUIRunDefaults
}

function toolResultOutputToString(output: ToolResultPart['output']): string {
  if (output.type === 'text' || output.type === 'error-text') return output.value
  if (output.type === 'json' || output.type === 'error-json') {
    try {
      return JSON.stringify(output.value ?? '')
    } catch {
      return String(output.value)
    }
  }
  if (output.type === 'execution-denied') return output.reason ?? ''
  try {
    return JSON.stringify(output)
  } catch {
    return String(output)
  }
}

function aguiContentToText(content: Message['content']): string {
  if (content == null) return ''
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (
        part &&
        typeof part === 'object' &&
        'type' in part &&
        part.type === 'text' &&
        'text' in part
      ) {
        return typeof part.text === 'string' ? part.text : ''
      }
      return ''
    })
    .join('')
}

/**
 * 将 AI SDK CoreMessage 列表转换为 AG-UI Message 列表。
 */
export function coreMessagesToAgui(messages: CoreMessage[]): Message[] {
  const result: Message[] = []

  for (const message of messages) {
    if (message.role === 'user') {
      const content =
        typeof message.content === 'string'
          ? message.content
          : message.content.map((part) => (part.type === 'text' ? part.text : '')).join('')
      result.push({
        id: randomUUID(),
        role: 'user',
        content
      })
      continue
    }

    if (message.role === 'assistant') {
      if (typeof message.content === 'string') {
        result.push({
          id: randomUUID(),
          role: 'assistant',
          content: message.content
        })
        continue
      }

      let text = ''
      const toolCalls: NonNullable<Extract<Message, { role: 'assistant' }>['toolCalls']> = []
      for (const part of message.content) {
        if (part.type === 'text') {
          text += part.text
          continue
        }
        if (part.type === 'tool-call') {
          toolCalls.push({
            id: part.toolCallId,
            type: 'function',
            function: {
              name: part.toolName,
              arguments: JSON.stringify(part.input ?? {})
            }
          })
        }
      }
      result.push({
        id: randomUUID(),
        role: 'assistant',
        content: text || undefined,
        ...(toolCalls.length > 0 ? { toolCalls } : {})
      })
      continue
    }

    if (message.role === 'tool') {
      for (const part of message.content) {
        if (part.type !== 'tool-result') continue
        result.push({
          id: randomUUID(),
          role: 'tool',
          toolCallId: part.toolCallId,
          content: toolResultOutputToString(part.output)
        })
      }
    }
  }

  return result
}

/**
 * 将 AG-UI Message 列表转换为 AI SDK CoreMessage 列表。
 */
export function aguiMessagesToCore(messages: Message[]): CoreMessage[] {
  const result: CoreMessage[] = []

  for (const message of messages) {
    if (message.role === 'user') {
      result.push({ role: 'user', content: aguiContentToText(message.content) })
      continue
    }

    if (message.role === 'assistant') {
      const toolCalls = message.toolCalls ?? []
      if (toolCalls.length === 0) {
        result.push({ role: 'assistant', content: message.content ?? '' })
        continue
      }

      const parts: Array<
        | { type: 'text'; text: string }
        | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
      > = []
      if (message.content) {
        parts.push({ type: 'text', text: message.content })
      }
      for (const tc of toolCalls) {
        let input: unknown = {}
        try {
          input = JSON.parse(tc.function.arguments || '{}')
        } catch {
          input = { raw: tc.function.arguments }
        }
        parts.push({
          type: 'tool-call',
          toolCallId: tc.id,
          toolName: tc.function.name,
          input
        })
      }
      result.push({ role: 'assistant', content: parts })
      continue
    }

    if (message.role === 'tool') {
      const toolMsg: ToolModelMessage = {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: message.toolCallId,
            toolName: 'unknown',
            output: { type: 'text', value: message.content ?? '' }
          }
        ]
      }
      result.push(toolMsg)
    }
  }

  return result
}

/**
 * 从 AG-UI messages 提取本轮用户文本，并得到 send 前应写入底层 agent 的历史。
 */
export function extractUserTurn(messages: Message[]): {
  userText: string
  history: CoreMessage[]
} {
  let lastUserIndex = -1
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') {
      lastUserIndex = i
      break
    }
  }
  if (lastUserIndex < 0) {
    throw new Error('RunAgentInput.messages must contain a user message')
  }

  const lastUser = messages[lastUserIndex]!
  const userText = aguiContentToText(lastUser.content).trim()
  if (!userText) {
    throw new Error('Last user message is empty')
  }

  return {
    userText,
    history: aguiMessagesToCore(messages.slice(0, lastUserIndex))
  }
}

function parseForwardedProps(forwarded: unknown): BaseAgentWithAGUIRunDefaults {
  if (!forwarded || typeof forwarded !== 'object') return {}
  const src = forwarded as Record<string, unknown>
  const out: BaseAgentWithAGUIRunDefaults = {}

  if (src.provider != null) {
    out.provider = src.provider as BaseAgentWithAGUIRunDefaults['provider']
  }
  if (src.abortController instanceof AbortController) {
    out.abortController = src.abortController
  }
  if (typeof src.maxSteps === 'number') {
    out.maxSteps = src.maxSteps
  }
  if (typeof src.invokeTimeoutMs === 'number') {
    out.invokeTimeoutMs = src.invokeTimeoutMs
  }
  if (src.tools != null && typeof src.tools === 'object') {
    out.tools = src.tools as BaseAgentWithAGUIRunDefaults['tools']
  }
  if (src.toolsMode === 'merge' || src.toolsMode === 'replace') {
    out.toolsMode = src.toolsMode
  }

  return out
}

function detachNonCloneableForwardedProps(forwarded: unknown): {
  cloneable: Record<string, unknown>
  extras: BaseAgentWithAGUIRunDefaults
} {
  if (!forwarded || typeof forwarded !== 'object') {
    return { cloneable: {}, extras: {} }
  }

  const cloneable = { ...(forwarded as Record<string, unknown>) }
  const extras: BaseAgentWithAGUIRunDefaults = {}

  if ('provider' in cloneable && cloneable.provider != null) {
    extras.provider = cloneable.provider as BaseAgentWithAGUIRunDefaults['provider']
    delete cloneable.provider
  }

  if (cloneable.abortController instanceof AbortController) {
    extras.abortController = cloneable.abortController
    delete cloneable.abortController
  } else if ('abortController' in cloneable) {
    delete cloneable.abortController
  }

  return { cloneable, extras }
}

function toolArgsToJsonDelta(args: string | undefined): string {
  if (args == null || args === '') return '{}'
  try {
    JSON.parse(args)
    return args
  } catch {
    return JSON.stringify({ summary: args })
  }
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.message.toLowerCase().includes('abort'))
  )
}

function formatRunError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error != null) return String(error)
  return 'Run failed'
}

/**
 * AG-UI AbstractAgent 实现：内部委托 createBaseAgent。
 */
export class BaseAgentWithAGUI extends AbstractAgent {
  public headers?: Record<string, string>

  private readonly config: CreateBaseAgentWithAGUIOptions
  private readonly inner: BaseAgent
  private readonly runDefaults: BaseAgentWithAGUIRunDefaults
  private activeAbort: AbortController | null = null
  private pendingForwardedExtras: BaseAgentWithAGUIRunDefaults = {}

  constructor(config: CreateBaseAgentWithAGUIOptions) {
    const { baseAgent: baseAgentOptions, runDefaults, ...rest } = config
    super(rest)
    this.config = config
    this.inner = createBaseAgent(baseAgentOptions ?? {})
    this.runDefaults = runDefaults ?? {}
  }

  public clone(): BaseAgentWithAGUI {
    const cloned = new BaseAgentWithAGUI({
      ...this.config,
      threadId: this.threadId,
      initialMessages: structuredClone(this.messages),
      initialState: structuredClone(this.state)
    })
    if (this.headers) {
      cloned.headers = { ...this.headers }
    }
    return cloned
  }

  public abortRun(): void {
    this.activeAbort?.abort()
    super.abortRun()
  }

  protected prepareRunAgentInput(parameters?: RunAgentParameters): RunAgentInput {
    const { cloneable, extras } = detachNonCloneableForwardedProps(parameters?.forwardedProps)
    this.pendingForwardedExtras = extras
    return super.prepareRunAgentInput({
      ...parameters,
      forwardedProps: cloneable
    })
  }

  public run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      const fromForwarded = {
        ...this.pendingForwardedExtras,
        ...parseForwardedProps(input.forwardedProps)
      }
      const abortController =
        fromForwarded.abortController ?? this.runDefaults.abortController ?? new AbortController()
      this.activeAbort = abortController

      void this.translateRun(input, abortController, subscriber).finally(() => {
        if (this.activeAbort === abortController) {
          this.activeAbort = null
        }
        this.pendingForwardedExtras = {}
      })

      return () => {
        abortController.abort()
      }
    })
  }

  private async translateRun(
    input: RunAgentInput,
    abortController: AbortController,
    subscriber: Subscriber<BaseEvent>
  ): Promise<void> {
    const threadId = input.threadId || this.threadId || randomUUID()
    const runId = input.runId || randomUUID()

    const emit = (event: BaseEvent) => {
      if (!subscriber.closed) subscriber.next(event)
    }

    const started: RunStartedEvent = {
      type: EventType.RUN_STARTED,
      threadId,
      runId,
      timestamp: Date.now()
    }
    emit(started)

    const messageId = randomUUID()
    let textStarted = false
    let textEnded = false
    let pendingResultText = ''

    const ensureTextStart = () => {
      if (textStarted) return
      textStarted = true
      const start: TextMessageStartEvent = {
        type: EventType.TEXT_MESSAGE_START,
        messageId,
        role: 'assistant',
        timestamp: Date.now()
      }
      emit(start)
    }

    const ensureTextEnd = () => {
      if (!textStarted || textEnded) return
      textEnded = true
      const end: TextMessageEndEvent = {
        type: EventType.TEXT_MESSAGE_END,
        messageId,
        timestamp: Date.now()
      }
      emit(end)
    }

    const flushResultText = (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      ensureTextStart()
      const content: TextMessageContentEvent = {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId,
        delta: text,
        timestamp: Date.now()
      }
      emit(content)
    }

    const merged: BaseAgentWithAGUIRunDefaults = {
      ...this.runDefaults,
      ...this.pendingForwardedExtras,
      ...parseForwardedProps(input.forwardedProps),
      abortController
    }

    try {
      const { userText, history } = extractUserTurn(input.messages ?? [])
      this.inner.messages = history

      if (!merged.provider) {
        throw new Error('provider is required in runDefaults or forwardedProps')
      }

      const runResult = await this.inner.send(userText, {
        ...merged,
        provider: merged.provider,
        onTextDelta: (text) => {
          if (!text) return
          pendingResultText += text
          const preview: CustomEvent = {
            type: EventType.CUSTOM,
            name: 'openworker.text.delta',
            value: { delta: text, messageId },
            timestamp: Date.now()
          }
          emit(preview)
        },
        onTextRevoke: () => {
          pendingResultText = ''
          const revoke: CustomEvent = {
            type: EventType.CUSTOM,
            name: 'openworker.text.revoke',
            value: { messageId },
            timestamp: Date.now()
          }
          emit(revoke)
        },
        onThinking: (text, durationMs) => {
          const trimmed = text.trim()
          if (!trimmed) return
          const custom: CustomEvent = {
            type: EventType.CUSTOM,
            name: 'cursor.thinking',
            value: {
              text: trimmed,
              ...(typeof durationMs === 'number' && Number.isFinite(durationMs)
                ? { thinkingDurationMs: durationMs }
                : {})
            },
            timestamp: Date.now()
          }
          emit(custom)
        },
        onTool: (observation: ToolObservation) => {
          ensureTextStart()
          if (observation.status === 'start') {
            const start: ToolCallStartEvent = {
              type: EventType.TOOL_CALL_START,
              toolCallId: observation.toolCallId,
              toolCallName: observation.id,
              parentMessageId: messageId,
              timestamp: observation.timestampMs ?? Date.now()
            }
            emit(start)

            const args: ToolCallArgsEvent = {
              type: EventType.TOOL_CALL_ARGS,
              toolCallId: observation.toolCallId,
              delta: toolArgsToJsonDelta(observation.args),
              timestamp: observation.timestampMs ?? Date.now()
            }
            emit(args)

            const end: ToolCallEndEvent = {
              type: EventType.TOOL_CALL_END,
              toolCallId: observation.toolCallId,
              timestamp: observation.timestampMs ?? Date.now()
            }
            emit(end)
            return
          }

          const result: ToolCallResultEvent = {
            type: EventType.TOOL_CALL_RESULT,
            messageId: randomUUID(),
            toolCallId: observation.toolCallId,
            content: observation.result ?? '',
            role: 'tool',
            timestamp: observation.timestampMs ?? Date.now()
          }
          emit(result)
        },
        onEmit: (event) => {
          const custom: CustomEvent = {
            type: EventType.CUSTOM,
            name: 'openworker.stream',
            value: event,
            timestamp: Date.now()
          }
          emit(custom)
        }
      })

      const finalText =
        typeof runResult.result === 'string' && runResult.result.trim()
          ? runResult.result
          : pendingResultText
      flushResultText(finalText)
      ensureTextEnd()

      const finished: RunFinishedEvent = {
        type: EventType.RUN_FINISHED,
        threadId,
        runId,
        result: runResult.result,
        timestamp: Date.now()
      }
      emit(finished)
      if (!subscriber.closed) subscriber.complete()
    } catch (error) {
      ensureTextEnd()

      const cancelled = isAbortError(error) || abortController.signal.aborted
      const runError: RunErrorEvent = {
        type: EventType.RUN_ERROR,
        message: formatRunError(error),
        code: cancelled ? 'CANCELLED' : 'ERROR',
        timestamp: Date.now()
      }
      emit(runError)
      if (!subscriber.closed) subscriber.complete()
    }
  }
}
