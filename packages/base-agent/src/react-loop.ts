/**
 * @file react-loop.ts
 * @description ReAct 循环实现（基于 AI SDK CoreMessage + ToolSet）
 */
import { streamChatStep, toToolDeclarations } from '@openworker/llm'
import type {
  AssistantModelMessage,
  LanguageModel,
  ModelMessage,
  ToolCallPart,
  ToolExecutionOptions,
  ToolModelMessage,
  ToolResultPart,
  ToolSet
} from 'ai'

type CoreAssistantMessage = AssistantModelMessage
type CoreMessage = ModelMessage
type CoreToolMessage = ToolModelMessage

import { agentLog } from './logger.js'

export type FormatToolResultForContext = (toolName: string, result: unknown) => unknown

/** `runReActLoop` 入参：全部字段放在单一对象上，避免位置参数错位。 */
export type RunReActLoopParams = {
  model: LanguageModel
  systemPrompt: string
  messages: CoreMessage[]
  tools: ToolSet
  abortController: AbortController
  maxSteps?: number
  timeoutMs?: number
  onToken: (token: string) => void
  onThinking?: (text: string, durationMs?: number) => void
  onTextRevoke?: () => void
  formatToolResultForContext?: FormatToolResultForContext
}

/**
 * 构造单条 tool 结果消息。
 *
 * 如果把完整 tools（含 execute）直接传给 streamText，SDK 在模型返回 tool_calls 后会自动执行（即使默认 maxSteps: 1）。
 *
 * @param tc - 对应的工具调用
 * @param result - 执行结果（保留结构化对象；provider 发送前再序列化）
 * @returns AI SDK tool 消息
 */
function toToolResultOutput(result: unknown): ToolResultPart['output'] {
  if (typeof result === 'string') return { type: 'text', value: result }
  try {
    return { type: 'json', value: JSON.parse(JSON.stringify(result)) }
  } catch {
    return { type: 'text', value: String(result) }
  }
}

function toolResultMessage(tc: ToolCallPart, result: unknown): CoreToolMessage {
  return {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        output: toToolResultOutput(result)
      }
    ]
  }
}

/**
 * 依次执行工具调用，收集 tool 结果消息。
 *
 * @param toolCalls - 模型返回的工具调用
 * @param tools - AI SDK ToolSet
 * @param messages - 传给 ToolExecutionOptions.messages：发起本轮 tool call 前的会话快照
 *   （不含顶层 system，也不含本轮带 tool-call 的 assistant，与 AI SDK 约定一致）
 * @param signal - 可选取消信号
 * @returns AI SDK tool 结果消息列表
 */
async function executeToolCalls(
  toolCalls: ToolCallPart[],
  tools: ToolSet,
  messages: CoreMessage[],
  signal?: AbortSignal,
  formatToolResultForContext?: FormatToolResultForContext
): Promise<CoreToolMessage[]> {
  const out: CoreToolMessage[] = []
  for (const tc of toolCalls) {
    const impl = tools[tc.toolName]
    if (!impl?.execute) {
      // 失败时仍把错误信息写进 result，靠文案让模型感知失败
      out.push(toolResultMessage(tc, `Tool not found: ${tc.toolName}`))
      continue
    }
    try {
      const raw = await impl.execute(tc.input, {
        toolCallId: tc.toolCallId,
        messages,
        abortSignal: signal,
        context: {}
      } as ToolExecutionOptions<unknown>)
      const result = formatToolResultForContext ? formatToolResultForContext(tc.toolName, raw) : raw
      out.push(toolResultMessage(tc, result))
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      out.push(toolResultMessage(tc, message))
    }
  }
  return out
}

/**
 * 根据流式结果构造 assistant CoreMessage。
 *
 * @param text - 助手文本
 * @param toolCalls - 模型返回的工具调用
 * @returns assistant 消息
 */
function buildAssistantMessage(text: string, toolCalls: ToolCallPart[]): CoreAssistantMessage {
  if (!toolCalls.length) {
    return { role: 'assistant', content: text }
  }

  const content: Array<{ type: 'text'; text: string } | ToolCallPart> = []
  if (text) {
    content.push({ type: 'text', text })
  }
  content.push(...toolCalls)
  return { role: 'assistant', content }
}

/**
 * ReAct 循环
 *
 * 入参与返回均为 AI SDK `CoreMessage` / `ToolSet`；模型调用经 `@openworker/llm` 的 `streamChatStep`。
 *
 * 每步文本先经 `onToken` 增量流出（打字机效果）；步结束时再分流：
 * - 本步有 tool calls → `onTextRevoke`（撤回已流出的 Result）+ `onThinking`（进入 Worked → Thought）
 * - 本步无 tool calls → 保留已流出的 delta 作为最终 Result（不再整段重发）
 *
 * @param params - 见 {@link RunReActLoopParams}
 * @returns 运行结束后的 CoreMessage 列表（含输入消息与本轮新增）
 */
export async function runReActLoop(params: RunReActLoopParams): Promise<CoreMessage[]> {
  const {
    model,
    systemPrompt,
    messages,
    tools,
    abortController: ac,
    onToken,
    maxSteps,
    timeoutMs,
    onThinking,
    onTextRevoke,
    formatToolResultForContext
  } = params
  const defaultMaxSteps = 50
  const defaultTimeoutMs = 1000 * 60 * 60 * 24 // 24 hours

  const resolvedMaxSteps = maxSteps ?? defaultMaxSteps
  const resolvedTimeoutMs = timeoutMs ?? defaultTimeoutMs

  const declarations = toToolDeclarations(tools)
  const working = [...messages]
  let steps = 0

  const deadline = Date.now() + resolvedTimeoutMs

  while (steps < resolvedMaxSteps) {
    if (ac.signal.aborted) throw new Error('Aborted')
    if (Date.now() > deadline) {
      ac.abort()
      throw new Error(`Model-tool loop timeout (>${resolvedTimeoutMs}ms), run aborted`)
    }

    const stepStartedAt = Date.now()

    // messages 里不要塞 role: 'system'，避免和顶层 system 重复
    agentLog.info(`[react-loop] llm:in step=${steps}`, {
      system: systemPrompt,
      messages: working,
      tools: Object.keys(declarations)
    })

    const { text, toolCalls, usage, streamedLen } = await streamChatStep({
      model,
      system: systemPrompt,
      messages: working,
      tools: declarations,
      abortSignal: ac.signal,
      onTextDelta: onToken
    })

    const stepDurationMs = Date.now() - stepStartedAt

    agentLog.info(`[react-loop] llm:out step=${steps} durationMs=${stepDurationMs}`, {
      text,
      toolCalls,
      usage
    })

    if (toolCalls.length > 0) {
      if (streamedLen > 0) onTextRevoke?.()
      if (text.trim()) onThinking?.(text, stepDurationMs)
    } else if (streamedLen === 0 && text.trim()) {
      // 无 delta 仅整段 text 的兜底（部分 provider / 模拟实现）
      onToken(text)
    }

    // ToolExecutionOptions.messages：不含 system，也不含本轮带 tool-call 的 assistant
    const messagesForTool = working.slice()

    working.push(buildAssistantMessage(text, toolCalls))

    // 有 tool calls → 继续「执行工具 → 再调用模型」
    // 没有 tool calls → 任务收尾，返回完整 working
    if (toolCalls.length === 0) break
    steps += 1

    working.push(
      ...(await executeToolCalls(
        toolCalls,
        tools,
        messagesForTool,
        ac.signal,
        formatToolResultForContext
      ))
    )
  }

  return working
}
