import type { BaseEvent, Message } from '@ag-ui/client'
import type { ChatSessionMessage } from '@openworker/ui'

import type { ChatTranscript, TaskChatHint } from '@/components/chat/chat-types'

/**
 * 将 AG-UI Message.content 收成纯文本。
 *
 * @param content - Message.content
 * @returns 纯文本
 */
export function messageContentToText(content: Message['content']): string {
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
        'text' in part &&
        typeof part.text === 'string'
      ) {
        return part.text
      }
      return ''
    })
    .join('')
}

/**
 * 取一条 AG-UI 消息的展示/落盘正文。
 *
 * @param message - AG-UI Message
 * @returns 纯文本
 */
export function messageText(message: Message): string {
  if (message.role === 'activity') return ''
  return messageContentToText(message.content)
}

/**
 * 助手是否已有非空正文。
 *
 * @param message - AG-UI Message
 * @returns 有正文则为 true
 */
export function hasAssistantText(message: Message | undefined): boolean {
  if (!message || message.role !== 'assistant') return false
  return Boolean(messageText(message).trim())
}

/**
 * 只保留「用户 + 非空助手」成对回合。没有助手回复的 user 不落盘。
 *
 * @param messages - AG-UI 消息
 * @returns 可落盘的成对消息
 */
export function takeCompletedRounds(messages: Message[]): Message[] {
  const complete: Message[] = []
  let i = 0
  while (i < messages.length) {
    const item = messages[i]!
    if (item.role !== 'user') {
      if (item.role === 'assistant' && !hasAssistantText(item)) {
        i += 1
        continue
      }
      complete.push(item)
      i += 1
      continue
    }
    let j = i + 1
    let lastAssistantWithText = -1
    while (j < messages.length && messages[j]!.role !== 'user') {
      if (hasAssistantText(messages[j])) lastAssistantWithText = j
      j += 1
    }
    if (lastAssistantWithText >= 0) {
      complete.push(...messages.slice(i, lastAssistantWithText + 1))
      i = lastAssistantWithText + 1
      continue
    }
    i = j
  }
  return complete
}

const EMPTY_HINT: TaskChatHint = { running: false, started: false, preview: '' }

/**
 * 把会话快照收成卡片按钮所需字段。
 *
 * @param transcript - 该文件名的会话
 * @returns 按钮状态
 */
export function chatTranscriptHint(transcript: ChatTranscript | undefined): TaskChatHint {
  if (!transcript) return EMPTY_HINT
  let preview = ''
  for (let i = transcript.messages.length - 1; i >= 0; i -= 1) {
    const item = transcript.messages[i]
    const text = messageText(item).trim()
    if (item.role === 'assistant' && text) {
      preview = text
      break
    }
  }
  return {
    running: transcript.running,
    started: transcript.started,
    error: transcript.error,
    preview
  }
}

/**
 * 弹窗初始历史：已完成回合；若正在 run，只带上本轮 user，助手交给事件流重放。
 *
 * @param messages - 内存 transcript 消息
 * @param running - 是否正在 run
 * @returns 可作 initialMessages 的 AG-UI 消息
 */
export function historyBeforeCurrentRun(messages: Message[], running: boolean): Message[] {
  if (!running) return takeCompletedRounds(messages)
  const copy = [...messages]
  while (copy.at(-1)?.role === 'assistant') copy.pop()
  const user = copy.at(-1)
  const prior = user?.role === 'user' ? copy.slice(0, -1) : copy
  const complete = takeCompletedRounds(prior)
  if (user?.role === 'user') return [...complete, user]
  return complete
}

/**
 * 把 AG-UI Message[] 转成会话气泡（折叠正文 + 时间线源事件）。
 *
 * @param messages - 协议消息
 * @param options - 进行中标记与已结束回合的时间线
 * @returns ChatSessionMessage 列表
 */
export function toChatSessionMessages(
  messages: Message[],
  options?: {
    running?: boolean
    assistantEvents?: Record<string, BaseEvent[]>
  }
): ChatSessionMessage[] {
  let latestAssistantId: string | null = null
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'assistant') {
      latestAssistantId = messages[i]!.id
      break
    }
  }
  const out: ChatSessionMessage[] = []
  for (const item of messages) {
    if (item.role !== 'user' && item.role !== 'assistant' && item.role !== 'system') continue
    out.push({
      id: item.id,
      role: item.role,
      content: messageText(item),
      aguiEvents: item.role === 'assistant' ? options?.assistantEvents?.[item.id] : undefined,
      streaming: Boolean(
        options?.running && item.role === 'assistant' && item.id === latestAssistantId
      )
    })
  }
  return out
}
