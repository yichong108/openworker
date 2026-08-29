/**
 * OpenWorkerAgentAGUI — Native 唯一对话入口。
 * 持有 OpenWorkerAgent，自定义实现 AG-UI AbstractAgent。
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
import type { CoreMessage } from '@openworker/base-agent'
import {
  OPENWORKER_PLAN_CUSTOM_NAME,
  parsePlanArtifact,
  type AgentRunInput
} from '@openworker/agent'
import { normalizeComposerMode } from '@openworker/shared'
import type { ToolObservation } from '@openworker/tools'
import type { LanguageModel, ToolModelMessage } from 'ai'
import { Observable, type Subscriber } from 'rxjs'

import { OpenWorkerAgent, type AgentMcp } from './openworker-agent.js'

/** 每轮 send 的默认参数（不含流式回调；字段均可选，合并后须含 provider） */
export type OpenWorkerAgentRunDefaults = Partial<
  Omit<AgentRunInput, 'onTextDelta' | 'onTextRevoke' | 'onThinking' | 'onTool' | 'onEmit'>
>

/**
 * OpenWorkerAgentAGUI 配置：AG-UI AgentConfig + 产品字段。
 */
export type OpenWorkerAgentAGUIConfig = AgentConfig & {
  /**
   * 角色：
   * - session（默认）：会话对话；dispose 为 no-op（避免误清进程级 MCP 池）
   * - mcp-host：MCP 预热/探测宿主；dispose 会释放 MCP 连接池
   */
  role?: 'session' | 'mcp-host'
  /** 工作区根目录 */
  cwd?: string
  /** 对话模型（可在 create 占位，run 时经 forwardedProps.provider 覆盖） */
  provider?: LanguageModel | null
  runDefaults?: OpenWorkerAgentRunDefaults
}

/** 宿主组装本轮 run 参数时的统一输入 */
export type OpenWorkerAgentRunInput = {
  composerMode?: OpenWorkerAgentRunDefaults['composerMode']
  abortController?: AbortController
  workspacePath?: string
  terminalKey?: string
  provider?: LanguageModel | null
  tavilyApiKey?: string
  maxSteps?: number
  invokeTimeoutMs?: number
  /** 会话记忆压缩段落 */
  memorySystemSection?: string
  /** 用户已批准的实施计划（Build 执行阶段注入） */
  planMarkdown?: string
}

/**
 * 从 RunAgentInput.forwardedProps 解析可覆盖的运行参数。
 *
 * @param forwarded - AG-UI forwardedProps
 * @returns 部分 OpenWorkerAgentRunDefaults
 */
function parseForwardedProps(forwarded: unknown): OpenWorkerAgentRunDefaults {
  if (!forwarded || typeof forwarded !== 'object') return {}
  const src = forwarded as Record<string, unknown>
  const out: OpenWorkerAgentRunDefaults = {}

  if (typeof src.composerMode === 'string') {
    out.composerMode = src.composerMode as OpenWorkerAgentRunDefaults['composerMode']
  }
  if (src.provider != null) {
    out.provider = src.provider as OpenWorkerAgentRunDefaults['provider']
  }
  if (src.abortController instanceof AbortController) {
    out.abortController = src.abortController
  }
  if (typeof src.workspacePath === 'string') {
    out.workspacePath = src.workspacePath
  }
  if (typeof src.terminalKey === 'string') {
    out.terminalKey = src.terminalKey
  }
  if (src.tavily != null && typeof src.tavily === 'object') {
    out.tavily = src.tavily as OpenWorkerAgentRunDefaults['tavily']
  }
  if (typeof src.maxSteps === 'number') {
    out.maxSteps = src.maxSteps
  }
  if (typeof src.invokeTimeoutMs === 'number') {
    out.invokeTimeoutMs = src.invokeTimeoutMs
  }
  if (typeof src.memorySystemSection === 'string') {
    out.memorySystemSection = src.memorySystemSection
  }
  if (typeof src.planMarkdown === 'string') {
    out.planMarkdown = src.planMarkdown
  }

  return out
}

/**
 * 在 AG-UI structuredClone 之前剥离不可克隆字段。
 *
 * @param forwarded - 原始 forwardedProps
 * @returns cloneable 与 extras
 */
function detachNonCloneableForwardedProps(forwarded: unknown): {
  cloneable: Record<string, unknown>
  extras: OpenWorkerAgentRunDefaults
} {
  if (!forwarded || typeof forwarded !== 'object') {
    return { cloneable: {}, extras: {} }
  }

  const cloneable = { ...(forwarded as Record<string, unknown>) }
  const extras: OpenWorkerAgentRunDefaults = {}

  if ('provider' in cloneable && cloneable.provider != null) {
    extras.provider = cloneable.provider as OpenWorkerAgentRunDefaults['provider']
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

/**
 * 将 AG-UI 消息 content 转为纯文本。
 *
 * @param content - 字符串或多模态片段数组
 * @returns 纯文本
 */
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
 * 将 AG-UI Message 列表转换为 AI SDK CoreMessage 列表。
 *
 * @param messages - AG-UI 消息
 * @returns CoreMessage 列表
 */
function aguiMessagesToCore(messages: Message[]): CoreMessage[] {
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
        | {
            type: 'tool-call'
            toolCallId: string
            toolName: string
            input: unknown
          }
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
 *
 * @param messages - AG-UI 消息列表
 * @returns userText 与历史 CoreMessage
 * @throws 无有效用户消息时抛出
 */
function extractUserTurn(messages: Message[]): {
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

/**
 * 将工具观察参数规范为 AG-UI TOOL_CALL_ARGS 的 JSON 字符串。
 *
 * @param args - ToolObservation.args
 * @returns JSON 字符串
 */
function toolArgsToJsonDelta(args: string | undefined): string {
  if (args == null || args === '') return '{}'
  try {
    JSON.parse(args)
    return args
  } catch {
    return JSON.stringify({ summary: args })
  }
}

/**
 * 判断异常是否由 AbortController 取消触发。
 *
 * @param error - 捕获的未知异常
 * @returns 是否为 abort 类错误
 */
function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.message.toLowerCase().includes('abort'))
  )
}

/**
 * 将捕获的异常映射为 RUN_ERROR 文案。
 *
 * @param error - send 抛出的异常
 * @returns 错误消息
 */
function formatRunError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error != null) return String(error)
  return 'Run failed'
}

/**
 * Native AG-UI Agent：持有 OpenWorkerAgent，自行映射事件流。
 */
export class OpenWorkerAgentAGUI extends AbstractAgent {
  /** CopilotKit Runtime 可能注入的 per-request headers */
  public headers?: Record<string, string>

  private readonly config: OpenWorkerAgentAGUIConfig
  private readonly inner: OpenWorkerAgent
  private readonly role: 'session' | 'mcp-host'
  private readonly runDefaults: OpenWorkerAgentRunDefaults
  private activeAbort: AbortController | null = null
  private pendingForwardedExtras: OpenWorkerAgentRunDefaults = {}

  /**
   * 创建 OpenWorker AG-UI Agent。
   *
   * @param config - AG-UI 与产品配置
   */
  constructor(config: OpenWorkerAgentAGUIConfig) {
    const { role, cwd, provider, runDefaults, ...agui } = config
    super(agui)
    this.config = config
    this.role = role ?? 'session'
    this.runDefaults = runDefaults ?? {}
    this.inner = new OpenWorkerAgent({
      cwd
    })
    if (provider) {
      this.runDefaults = { ...this.runDefaults, provider }
    }
  }

  /**
   * MCP 宿主能力（probe / warmup / dispose）。
   */
  public get mcp(): AgentMcp {
    return this.inner.mcp
  }

  /**
   * 校验当前是否具备开跑条件（密钥等）。
   *
   * @param options - 本轮可用的 provider
   * @throws 缺少必要凭据时抛出 Error
   */
  public assertReady(options?: { provider?: LanguageModel | null }): void {
    const provider = options?.provider ?? this.config.provider
    if (!provider) {
      throw new Error('请先在设置中配置 API Key')
    }
  }

  /**
   * 组装本轮 forwardedProps。
   *
   * @param input - 统一 run 参数
   * @returns 可交给 runAgent({ forwardedProps }) 的对象
   */
  public buildRunForwardedProps(input: OpenWorkerAgentRunInput): OpenWorkerAgentRunDefaults {
    return {
      composerMode: input.composerMode,
      abortController: input.abortController,
      workspacePath: input.workspacePath,
      provider: input.provider ?? this.config.provider ?? undefined,
      terminalKey: input.terminalKey,
      tavily: input.tavilyApiKey != null ? { apiKey: input.tavilyApiKey } : undefined,
      maxSteps: input.maxSteps,
      invokeTimeoutMs: input.invokeTimeoutMs,
      ...(input.memorySystemSection != null
        ? { memorySystemSection: input.memorySystemSection }
        : {}),
      ...(input.planMarkdown != null ? { planMarkdown: input.planMarkdown } : {})
    }
  }

  /**
   * 克隆当前 agent（新 OpenWorkerAgent，复制 AG-UI 消息与 state）。
   *
   * @returns 新的 OpenWorkerAgentAGUI
   */
  public clone(): OpenWorkerAgentAGUI {
    const cloned = new OpenWorkerAgentAGUI({
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

  /**
   * 取消当前进行中的 run。
   */
  public abortRun(): void {
    this.activeAbort?.abort()
    super.abortRun()
  }

  /**
   * 释放后端资源。
   *
   * - mcp-host：释放 MCP 连接池
   * - session：no-op（避免误清进程级 MCP 池）
   */
  public async dispose(): Promise<void> {
    if (this.role === 'mcp-host') {
      await this.inner.dispose()
    }
  }

  /**
   * 组装 RunAgentInput：剥离不可克隆的 forwardedProps。
   *
   * @param parameters - runAgent 入参
   * @returns 可安全克隆的 RunAgentInput
   */
  protected prepareRunAgentInput(parameters?: RunAgentParameters): RunAgentInput {
    const { cloneable, extras } = detachNonCloneableForwardedProps(parameters?.forwardedProps)
    this.pendingForwardedExtras = extras
    return super.prepareRunAgentInput({
      ...parameters,
      forwardedProps: cloneable
    })
  }

  /**
   * 按 AG-UI 协议执行一轮，产出事件 Observable。
   *
   * @param input - AG-UI RunAgentInput
   * @returns BaseEvent 流
   */
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

  /**
   * 将 OpenWorkerAgent.send 回调翻译为 AG-UI 事件并推入 subscriber。
   *
   * @param input - AG-UI 入参
   * @param abortController - 本轮取消控制器
   * @param subscriber - RxJS 订阅者
   */
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

    const merged: OpenWorkerAgentRunDefaults = {
      ...this.runDefaults,
      ...this.pendingForwardedExtras,
      ...parseForwardedProps(input.forwardedProps),
      abortController
    }

    try {
      const { userText, history } = extractUserTurn(input.messages ?? [])
      const provider = merged.provider ?? this.config.provider
      if (!provider) {
        throw new Error('请先在设置中配置 API Key')
      }

      const runResult = await this.inner.send(userText, {
        ...merged,
        provider,
        messages: history,
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

      const planMode = normalizeComposerMode(merged.composerMode) === 'plan'
      if (planMode && finalText.trim()) {
        const artifact = parsePlanArtifact(finalText)
        if (artifact) {
          const planEvent: CustomEvent = {
            type: EventType.CUSTOM,
            name: OPENWORKER_PLAN_CUSTOM_NAME,
            value: {
              markdown: artifact.markdown,
              ...(artifact.title ? { title: artifact.title } : {}),
              fromFence: artifact.fromFence
            },
            timestamp: Date.now()
          }
          emit(planEvent)
        }
      }

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
