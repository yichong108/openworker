/**
 * 将会话压缩结果格式化为可拼进 system prompt 的段落
 */

import { truncateChars } from './budget.js'

/**
 * 组装 Session so far / Pinned 系统段落。
 *
 * 使用明确分区标题，降低与工作区 system 规则的混淆（上下文污染）。
 *
 * @param summary - 压缩摘要
 * @param pinned - pinned 列表
 * @param summaryChars - 摘要预算（二次保险截断）
 * @returns systemSection 文本；摘要与 pinned 皆空时返回空串
 */
export function formatSessionSystemSection(
  summary: string,
  pinned: string[],
  summaryChars: number = 4_000
): string {
  const parts: string[] = []
  const rawSummary = (summary ?? '').trim()
  const limit =
    typeof summaryChars === 'number' && Number.isFinite(summaryChars) && summaryChars > 0
      ? Math.floor(summaryChars)
      : 4_000

  if (rawSummary) {
    const { text: clippedSummary } = truncateChars(rawSummary, limit)
    if (clippedSummary) {
      parts.push(`## Session so far (compressed)\n${clippedSummary}`)
    }
  }

  const cleanPinned = (pinned ?? []).map((p) => p.trim()).filter(Boolean)
  if (cleanPinned.length > 0) {
    parts.push(`## Pinned\n${cleanPinned.map((p) => `- ${p}`).join('\n')}`)
  }

  return parts.join('\n\n')
}
