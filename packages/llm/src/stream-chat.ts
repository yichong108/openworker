/**
 * @file 流式聊天一步（封装 AI SDK streamText）
 * @description 供 ReAct 等上层循环调用；不自动执行 tools（调用方应传入无 execute 的声明）。
 */

import {
  stepCountIs,
  streamText,
  type LanguageModel,
  type ModelMessage,
  type Tool,
  type ToolCallPart,
  type ToolSet
} from 'ai'

/** 对外稳定别名，与历史 `CoreMessage` 导出名一致 */
type CoreMessage = ModelMessage

/**
 * 构建仅用于模型声明的 ToolSet（去掉 execute，避免 streamText 自动执行）。
 *
 * ReAct 等循环应手动调用 Tool.execute，以便控制工具观察上报、错误与取消语义。
 *
 * @param tools - 完整 ToolSet（含 execute）
 * @returns 仅含 inputSchema/description 的声明用 ToolSet
 */
export function toToolDeclarations(tools: ToolSet): ToolSet {
  const set: ToolSet = {}
  for (const [name, t] of Object.entries(tools)) {
    set[name] = {
      description: t.description,
      inputSchema: t.inputSchema
    } as Tool
  }
  return set
}

/**
 * 单步流式聊天入参
 */
export type StreamChatStepParams = {
  /** AI SDK LanguageModel */
  model: LanguageModel
  /** system 提示（勿再把 role: system 塞进 messages） */
  system: string
  /** 会话消息 */
  messages: CoreMessage[]
  /**
   * 工具声明（应去掉 execute）。
   * 若传入含 execute 的 ToolSet，SDK 可能在返回 tool_calls 后自动执行。
   */
  tools?: ToolSet
  /** 取消信号 */
  abortSignal?: AbortSignal
  /** 文本增量回调（打字机效果） */
  onTextDelta?: (delta: string) => void
}

/**
 * 单步流式聊天结果
 */
export type StreamChatStepResult = {
  /** 本步完整助手文本 */
  text: string
  /** 本步工具调用（无则为空数组） */
  toolCalls: ToolCallPart[]
  /** token 用量（provider 未返回时可能为 undefined） */
  usage: Awaited<ReturnType<typeof streamText>['usage']>
  /** 经 onTextDelta 实际流出的字符数 */
  streamedLen: number
}

/**
 * 调用 AI SDK `streamText` 完成一轮模型推理（单步）。
 *
 * 增量文本经 `onTextDelta` 流出；结束后返回完整 text / toolCalls / usage。
 * 不负责执行工具——调用方应根据 toolCalls 自行 execute 并拼回消息。
 *
 * @param params - 模型、system、消息、工具声明与流式回调
 * @returns 本步文本、工具调用、用量与已流式字符数
 */
export async function streamChatStep(params: StreamChatStepParams): Promise<StreamChatStepResult> {
  const { model, system, messages, tools, abortSignal, onTextDelta } = params

  const result = streamText({
    model,
    system,
    messages,
    tools,
    abortSignal,
    stopWhen: stepCountIs(1)
  })

  let stepText = ''
  let streamedLen = 0
  for await (const chunk of result.stream) {
    if (chunk.type === 'text-delta' && chunk.text) {
      stepText += chunk.text
      onTextDelta?.(chunk.text)
      streamedLen += chunk.text.length
    }
  }

  const text = (await result.text) || stepText
  const rawCalls = await result.toolCalls
  const toolCalls: ToolCallPart[] = rawCalls.map((tc) => ({
    type: 'tool-call',
    toolCallId: tc.toolCallId,
    toolName: tc.toolName,
    input: tc.input
  }))
  const usage = await result.usage

  return { text, toolCalls, usage, streamedLen }
}
