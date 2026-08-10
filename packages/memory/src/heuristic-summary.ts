/**
 * 启发式会话摘要：不调用模型，从窗口外消息抽取短要点。
 */

import type { Message } from '@ag-ui/client'

import { messageContentToText, truncateChars } from './budget.js'

/** 匹配「请记住 / 以后都要 / 不要再」等约束句 */
const PINNED_RE =
  /(?:请记住|记住：|以后都要|以后都|不要再|务必|必须始终|always\s+remember|never\s+again|from\s+now\s+on)/i

/** tool 结果写入摘要时的最大字符 */
const TOOL_SNIPPET_CHARS = 120

/**
 * 从用户文本中抽取 pinned 候选。
 *
 * @param text - 用户消息文本
 * @returns 命中则返回修剪后的整句/段落，否则 null
 */
export function extractPinnedFromUserText(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed || !PINNED_RE.test(trimmed)) return null
  const { text: clipped } = truncateChars(trimmed.replace(/\s+/g, ' '), 240)
  return clipped || null
}

/**
 * 将窗口外消息压缩为要点列表文本。
 *
 * 策略：保留 user 指令与 assistant 结论的短摘录；tool 结果仅保留极短片段，避免污染。
 *
 * @param olderMessages - 未进入尾部窗口的消息
 * @param maxChars - 摘要最大字符
 * @returns 摘要文本与是否截断
 */
export function heuristicSummarizeMessages(
  olderMessages: Message[],
  maxChars: number
): { summary: string; truncated: boolean } {
  const lines: string[] = []

  for (const message of olderMessages) {
    if (message.role === 'user') {
      const text = messageContentToText(message.content).trim()
      if (!text) continue
      const { text: snippet } = truncateChars(text.replace(/\s+/g, ' '), 280)
      lines.push(`- User: ${snippet}`)
      continue
    }

    if (message.role === 'assistant') {
      const text = messageContentToText(message.content).trim()
      const toolNames =
        message.toolCalls
          ?.map((c) => c.function?.name)
          .filter(Boolean)
          .join(', ') ?? ''
      if (text) {
        const { text: snippet } = truncateChars(text.replace(/\s+/g, ' '), 280)
        lines.push(`- Assistant: ${snippet}`)
      } else if (toolNames) {
        lines.push(`- Assistant tools: ${toolNames}`)
      }
      continue
    }

    if (message.role === 'tool') {
      const text = messageContentToText(message.content).trim()
      if (!text) continue
      // 跳过明显失败噪音以外的超长 dump：只留短摘录
      const { text: snippet } = truncateChars(text.replace(/\s+/g, ' '), TOOL_SNIPPET_CHARS)
      if (/error|失败|exception|traceback/i.test(snippet)) {
        lines.push(`- Tool error: ${snippet}`)
      }
    }
  }

  const joined = lines.join('\n').trim()
  const clipped = truncateChars(joined, maxChars)
  return { summary: clipped.text, truncated: clipped.truncated }
}

/**
 * 合并先验摘要与本轮窗口外启发式摘要，并截断到预算。
 *
 * @param priorSummary - 上一轮 summary
 * @param olderMessages - 本轮窗口外消息
 * @param maxChars - 总预算
 * @returns 合并后的 summary 与是否截断
 */
export function mergeSummaries(
  priorSummary: string | undefined,
  olderMessages: Message[],
  maxChars: number
): { summary: string; truncated: boolean } {
  const prior = (priorSummary ?? '').trim()
  // 为先验预留约一半预算，其余给本轮新压缩内容
  const freshBudget = prior ? Math.max(200, Math.floor(maxChars * 0.55)) : maxChars
  const { summary: fresh, truncated: freshTrunc } = heuristicSummarizeMessages(
    olderMessages,
    freshBudget
  )

  if (!prior && !fresh) {
    return { summary: '', truncated: false }
  }
  if (!prior) {
    return { summary: fresh, truncated: freshTrunc }
  }
  if (!fresh) {
    const clipped = truncateChars(prior, maxChars)
    return { summary: clipped.text, truncated: clipped.truncated }
  }

  const combined = `${prior}\n${fresh}`
  const clipped = truncateChars(combined, maxChars)
  return { summary: clipped.text, truncated: clipped.truncated || freshTrunc }
}

/**
 * 合并 prior.pinned 与从消息中新抽取的 pinned，去重保序。
 *
 * @param priorPinned - 先验 pinned
 * @param messages - 用于抽取的消息（通常为窗口外 + 近期 user）
 * @returns 去重后的 pinned 列表
 */
export function mergePinned(priorPinned: string[] | undefined, messages: Message[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()

  const push = (raw: string) => {
    const key = raw.trim()
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push(key)
  }

  for (const item of priorPinned ?? []) {
    if (typeof item === 'string') push(item)
  }

  for (const message of messages) {
    if (message.role !== 'user') continue
    const pinned = extractPinnedFromUserText(messageContentToText(message.content))
    if (pinned) push(pinned)
  }

  return out
}
