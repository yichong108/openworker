/**
 * 单会话历史压缩：尾部原文窗口 + 窗口外启发式摘要
 */

import type { Message } from '@ag-ui/client'

import { estimateMessageChars, resolveSessionBudget } from './budget.js'
import { formatSessionSystemSection } from './format.js'
import { mergePinned, mergeSummaries } from './heuristic-summary.js'
import type { CompactSessionInput, CompactSessionResult } from './types.js'

/**
 * 判断两条消息是否因 toolCallId 必须同进同出窗口。
 *
 * AG-UI：assistant.toolCalls[].id ↔ role:tool 的 toolCallId。
 *
 * @param messages - 完整消息列表
 * @param index - 当前下标
 * @returns 需要连带纳入的下标集合（含自身）
 */
function collectPairedIndices(messages: Message[], index: number): number[] {
  const message = messages[index]
  if (!message) return [index]

  const indices = new Set<number>([index])

  if (message.role === 'assistant' && Array.isArray(message.toolCalls)) {
    const ids = new Set(message.toolCalls.map((c) => c.id).filter(Boolean))
    if (ids.size === 0) return [index]
    for (let i = index + 1; i < messages.length; i += 1) {
      const m = messages[i]
      if (m?.role === 'tool' && m.toolCallId && ids.has(m.toolCallId)) {
        indices.add(i)
      }
    }
    return [...indices].sort((a, b) => a - b)
  }

  if (message.role === 'tool' && message.toolCallId) {
    const toolCallId = message.toolCallId
    for (let i = index - 1; i >= 0; i -= 1) {
      const m = messages[i]
      if (m?.role !== 'assistant' || !Array.isArray(m.toolCalls)) continue
      if (m.toolCalls.some((c) => c.id === toolCallId)) {
        return collectPairedIndices(messages, i)
      }
    }
  }

  return [index]
}

/**
 * 从后向前按字符预算选择尾部窗口，并保证 tool 成对完整。
 *
 * @param messages - 完整消息
 * @param recentChars - 尾部字符预算
 * @returns cutIndex（该下标起为 recent）、recentMessages
 */
function selectRecentWindow(
  messages: Message[],
  recentChars: number
): { cutIndex: number; recentMessages: Message[] } {
  if (messages.length === 0) {
    return { cutIndex: 0, recentMessages: [] }
  }

  let used = 0
  const included = new Set<number>()

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (included.has(i)) continue
    const pair = collectPairedIndices(messages, i)
    let pairChars = 0
    for (const idx of pair) {
      const m = messages[idx]
      if (m) pairChars += estimateMessageChars(m)
    }

    // 至少保留最后一组（即使超预算），避免 recent 为空
    if (included.size > 0 && used + pairChars > recentChars) {
      break
    }

    for (const idx of pair) included.add(idx)
    used += pairChars
  }

  const cutIndex = included.size === 0 ? messages.length : Math.min(...included)
  return {
    cutIndex,
    recentMessages: messages.slice(cutIndex)
  }
}

/**
 * 压缩单会话 AG-UI 历史：保留尾部原文，窗口外并入启发式摘要。
 *
 * 纯函数：不读写存储、不感知 sessionId。宿主负责将返回的 summary/pinned 回灌为下次 prior。
 *
 * @param input - 消息、可选先验工作记忆与预算
 * @returns 压缩结果（recentMessages + systemSection + 更新后的 working）
 */
export function compactSessionHistory(input: CompactSessionInput): CompactSessionResult {
  const messages = Array.isArray(input.messages) ? input.messages : []
  const budget = resolveSessionBudget(input.budget)
  const { cutIndex, recentMessages } = selectRecentWindow(messages, budget.recentChars)
  const olderMessages = messages.slice(0, cutIndex)

  const { summary, truncated: summaryTruncated } = mergeSummaries(
    input.prior?.summary,
    olderMessages,
    budget.summaryChars
  )

  const pinned = mergePinned(input.prior?.pinned, messages)
  const systemSection = formatSessionSystemSection(summary, pinned, budget.summaryChars)

  const recentCharsUsed = recentMessages.reduce((n, m) => n + estimateMessageChars(m), 0)
  const pinnedChars = pinned.join('\n').length

  return {
    summary,
    pinned,
    recentMessages,
    systemSection,
    meta: {
      usedChars: {
        summary: summary.length,
        recent: recentCharsUsed,
        pinned: pinnedChars
      },
      truncated: summaryTruncated || olderMessages.length > 0,
      droppedCount: olderMessages.length
    }
  }
}
