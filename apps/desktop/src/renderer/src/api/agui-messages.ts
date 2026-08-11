/**
 * AG-UI Message[] ↔ 渲染层 ChatMessage 转换
 */

import type { Message } from '@ag-ui/client'

import type { ChatMessage } from '@/shared/ipc'

/**
 * 将 AG-UI Message.content 转为纯文本（展示用）。
 *
 * @param content - AG-UI Message.content
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
 * 将完整 AG-UI Message[] 转为渲染层 ChatMessage（仅 user/assistant/system 文本）。
 *
 * @param messages - AG-UI Message 列表
 * @returns ChatMessage 列表
 */
export function aguiMessagesToChatMessages(messages: Message[]): ChatMessage[] {
  const out: ChatMessage[] = []
  for (const msg of messages) {
    if (msg.role !== 'user' && msg.role !== 'assistant' && msg.role !== 'system') continue
    const content = aguiContentToText(msg.content)
    if (!content.trim() && msg.role !== 'user') continue
    out.push({
      id: msg.id || `m-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      role: msg.role,
      content
    })
  }
  return out
}
