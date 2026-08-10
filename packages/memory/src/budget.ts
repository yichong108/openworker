/**
 * 会话压缩预算默认值与字符计量工具
 */

import type { Message } from '@ag-ui/client'

import type { SessionBudget } from './types.js'

/**
 * 默认预算：
 * - recentChars（W）= 256k：尾部原文窗口
 * - summaryChars：窗口外压缩摘要上限
 */
export const DEFAULT_SESSION_BUDGET: SessionBudget = {
  summaryChars: 4_000,
  recentChars: 256_000
}

/** 宿主调用 refineSessionSummary 时的建议温度（T=0.7） */
export const DEFAULT_REFINE_TEMPERATURE = 0.7

/**
 * 合并调用方覆盖与默认预算。
 *
 * @param partial - 可选覆盖字段；非法非正数忽略
 * @returns 完整 SessionBudget
 */
export function resolveSessionBudget(partial?: Partial<SessionBudget>): SessionBudget {
  const summaryChars =
    typeof partial?.summaryChars === 'number' &&
    Number.isFinite(partial.summaryChars) &&
    partial.summaryChars > 0
      ? Math.floor(partial.summaryChars)
      : DEFAULT_SESSION_BUDGET.summaryChars
  const recentChars =
    typeof partial?.recentChars === 'number' &&
    Number.isFinite(partial.recentChars) &&
    partial.recentChars > 0
      ? Math.floor(partial.recentChars)
      : DEFAULT_SESSION_BUDGET.recentChars
  return { summaryChars, recentChars }
}

/**
 * 将 AG-UI Message.content 转为纯文本（忽略非 text 片段）。
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
 * 估算单条 AG-UI 消息占用的字符数（用于窗口预算）。
 *
 * tool 结果与 toolCall arguments 计入；超长内容按原文长度计量，截断由上层策略处理。
 *
 * @param message - AG-UI 消息
 * @returns 字符数（非负）
 */
export function estimateMessageChars(message: Message): number {
  let n = messageContentToText(message.content).length
  if (message.role === 'assistant' && Array.isArray(message.toolCalls)) {
    for (const call of message.toolCalls) {
      n += (call.function?.name ?? '').length
      n += (call.function?.arguments ?? '').length
    }
  }
  if (message.role === 'tool') {
    n += message.toolCallId?.length ?? 0
  }
  return n
}

/**
 * 将文本截断到 maxChars；超出时加省略标记。
 *
 * @param text - 原文
 * @param maxChars - 最大字符数
 * @returns 截断后的文本与是否发生截断
 */
export function truncateChars(
  text: string,
  maxChars: number
): { text: string; truncated: boolean } {
  if (maxChars <= 0) return { text: '', truncated: text.length > 0 }
  if (text.length <= maxChars) return { text, truncated: false }
  const ellipsis = '…'
  const keep = Math.max(0, maxChars - ellipsis.length)
  return { text: `${text.slice(0, keep)}${ellipsis}`, truncated: true }
}
