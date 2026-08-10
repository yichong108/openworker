/**
 * 可选的会话摘要 LLM 精炼（宿主注入 Summarizer）
 */

import { truncateChars } from './budget.js'
import type { Summarizer } from './types.js'

/**
 * 使用宿主提供的 Summarizer 精炼已有 summary。
 *
 * compact 主路径不调用本函数；由宿主（如 Desktop glue）在有新压缩内容时默认调用。
 * 建议温度见 `DEFAULT_REFINE_TEMPERATURE`（0.7），由宿主在 Summarizer 内设置。
 * Summarizer 失败时回退为截断后的原文 summary（不抛出，避免打断主对话）。
 *
 * @param input.summary - 待精炼摘要
 * @param input.pinned - 可选 pinned，写入精炼提示以保留约束
 * @param input.summarizer - 宿主注入的摘要器
 * @param input.maxChars - 目标最大字符，默认 4000
 * @returns 精炼后的摘要文本
 */
export async function refineSessionSummary(input: {
  summary: string
  pinned?: string[]
  summarizer: Summarizer
  maxChars?: number
}): Promise<string> {
  const maxChars =
    typeof input.maxChars === 'number' && Number.isFinite(input.maxChars) && input.maxChars > 0
      ? Math.floor(input.maxChars)
      : 4_000

  const summary = input.summary.trim()
  if (!summary) return ''

  const pinned = (input.pinned ?? []).map((p) => p.trim()).filter(Boolean)
  const pinnedBlock =
    pinned.length > 0
      ? `\n\nPinned constraints (keep):\n${pinned.map((p) => `- ${p}`).join('\n')}`
      : ''

  const prompt = [
    'Compress the following conversation working memory.',
    `Keep key decisions, constraints, and open questions. Max ${maxChars} characters.`,
    'Write in the same language as the input. Do not invent facts.',
    pinnedBlock,
    '',
    '---',
    summary
  ]
    .filter((line) => line !== '')
    .join('\n')

  try {
    const refined = (await input.summarizer.summarize({ prompt, maxChars })).trim()
    if (!refined) {
      return truncateChars(summary, maxChars).text
    }
    return truncateChars(refined, maxChars).text
  } catch {
    return truncateChars(summary, maxChars).text
  }
}
