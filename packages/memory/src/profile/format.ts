/**
 * 用户画像与记忆 system 段落格式化
 */

import { truncateChars } from '../budget.js'
import { DEFAULT_PROFILE_BUDGET, resolveProfileBudget } from './budget.js'
import type { ProfileBudget, UserProfile } from '../types.js'

/**
 * 将用户画像格式化为可拼进 system 的段落。
 *
 * 按 confidence × 新近度排序，截断到 profileChars。
 *
 * @param profile - 用户画像
 * @param budget - 可选预算
 * @returns `## User profile` 段落；无事实时返回空串
 */
export function formatProfileSection(
  profile: UserProfile | null | undefined,
  budget?: Partial<ProfileBudget>
): string {
  const { profileChars } = resolveProfileBudget(budget ?? DEFAULT_PROFILE_BUDGET)
  const facts = [...(profile?.facts ?? [])].sort((a, b) => {
    const scoreA = a.confidence * 1e12 + a.updatedAt
    const scoreB = b.confidence * 1e12 + b.updatedAt
    return scoreB - scoreA
  })
  if (facts.length === 0) return ''

  const lines: string[] = []
  let used = '## User profile\n'.length
  for (const fact of facts) {
    const line = `- ${fact.key}: ${fact.value}`
    if (used + line.length + 1 > profileChars) {
      const remain = profileChars - used - 1
      if (remain > 8) {
        const { text } = truncateChars(line, remain)
        if (text) lines.push(text)
      }
      break
    }
    lines.push(line)
    used += line.length + 1
  }

  if (lines.length === 0) return ''
  return `## User profile\n${lines.join('\n')}`
}

/**
 * 组合记忆 system 段落：User profile → Session so far / Pinned。
 *
 * @param input.profileSection - formatProfileSection 结果
 * @param input.sessionSection - formatSessionSystemSection 结果
 * @returns 拼接后的 system 段；皆空则空串
 */
export function composeMemorySystemSection(input: {
  profileSection?: string
  sessionSection?: string
}): string {
  return [input.profileSection?.trim(), input.sessionSection?.trim()].filter(Boolean).join('\n\n')
}
