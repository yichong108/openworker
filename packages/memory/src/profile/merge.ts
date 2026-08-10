/**
 * 合并用户画像事实
 */

import { MAX_PROFILE_FACTS } from './budget.js'
import type { UserFact, UserProfile } from '../types.js'

const KEY_PREFIX_RE = /^(preference|identity|project|workflow)\./

/**
 * 规范化单条事实；非法则返回 null。
 *
 * @param raw - 原始事实
 * @param now - 时间戳（缺省 updatedAt 时使用）
 */
export function normalizeUserFact(raw: unknown, now: number = Date.now()): UserFact | null {
  if (!raw || typeof raw !== 'object') return null
  const src = raw as Record<string, unknown>
  const key = typeof src.key === 'string' ? src.key.trim() : ''
  const value = typeof src.value === 'string' ? src.value.trim() : ''
  if (!key || !value || !KEY_PREFIX_RE.test(key)) return null

  let confidence = typeof src.confidence === 'number' ? src.confidence : 0.5
  if (!Number.isFinite(confidence)) confidence = 0.5
  confidence = Math.min(1, Math.max(0, confidence))

  const updatedAt =
    typeof src.updatedAt === 'number' && Number.isFinite(src.updatedAt)
      ? Math.floor(src.updatedAt)
      : now

  const source = src.source === 'llm' || src.source === 'explicit' ? src.source : undefined

  return { key, value, confidence, updatedAt, ...(source ? { source } : {}) }
}

/**
 * 比较两条同 key 事实，决定是否用 incoming 覆盖 existing。
 *
 * 规则：更高 confidence 优先；confidence 接近时取更新时间更晚者。
 *
 * @param existing - 已有事实
 * @param incoming - 新事实
 * @returns 是否覆盖
 */
function shouldReplace(existing: UserFact, incoming: UserFact): boolean {
  if (incoming.confidence > existing.confidence + 0.05) return true
  if (existing.confidence > incoming.confidence + 0.05) return false
  return incoming.updatedAt >= existing.updatedAt
}

/**
 * 将新事实合并进画像。
 *
 * 同 key 按 confidence / updatedAt 覆盖；总数截断到 MAX_PROFILE_FACTS（保留高分新近）。
 *
 * @param profile - 当前画像；可为 null/空
 * @param incoming - 待合并事实
 * @param now - 可选时钟
 * @returns 合并后的 UserProfile
 */
export function mergeProfileFacts(
  profile: UserProfile | null | undefined,
  incoming: UserFact[],
  now: number = Date.now()
): UserProfile {
  const byKey = new Map<string, UserFact>()

  for (const fact of profile?.facts ?? []) {
    const n = normalizeUserFact(fact, now)
    if (n) byKey.set(n.key, n)
  }

  for (const fact of incoming) {
    const n = normalizeUserFact(fact, now)
    if (!n) continue
    const existing = byKey.get(n.key)
    if (!existing || shouldReplace(existing, n)) {
      byKey.set(n.key, n)
    }
  }

  const facts = [...byKey.values()].sort((a, b) => {
    const scoreA = a.confidence * 1e12 + a.updatedAt
    const scoreB = b.confidence * 1e12 + b.updatedAt
    return scoreB - scoreA
  })

  const clipped = facts.slice(0, MAX_PROFILE_FACTS)
  return {
    facts: clipped,
    updatedAt: now
  }
}
