import type { BaseEvent, Message } from '@ag-ui/client'
import type { ChatSessionMessage } from '@openworker/ui'

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
