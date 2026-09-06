/**
 * 本机画像持久化 — 单行读写 facts_json（Prisma String）
 */

import type { PutUserProfileRequest, UserFactDto, UserProfileDto } from '@openworker/shared'

import { BadRequestError } from '../http/envelope.js'
import { getPrisma, LOCAL_PROFILE_ID } from '../db/prisma.js'

const MAX_FACTS = 64

/**
 * 校验并规范化事实列表。
 *
 * @throws BadRequestError 当 facts 非法时
 */
function normalizeFacts(facts: unknown): UserFactDto[] {
  if (!Array.isArray(facts)) {
    throw new BadRequestError('facts must be an array')
  }
  const out: UserFactDto[] = []
  for (const item of facts.slice(0, MAX_FACTS)) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const key = typeof row.key === 'string' ? row.key.trim() : ''
    const value = typeof row.value === 'string' ? row.value.trim() : ''
    if (!key || !value) continue
    let confidence = typeof row.confidence === 'number' ? row.confidence : 0.5
    if (!Number.isFinite(confidence)) confidence = 0.5
    confidence = Math.min(1, Math.max(0, confidence))
    const updatedAt =
      typeof row.updatedAt === 'number' && Number.isFinite(row.updatedAt)
        ? Math.floor(row.updatedAt)
        : Date.now()
    const source = row.source === 'llm' || row.source === 'explicit' ? row.source : undefined
    out.push({
      key,
      value,
      confidence,
      updatedAt,
      ...(source ? { source } : {})
    })
  }
  return out
}

/**
 * 解析 facts_json 为事实数组。
 */
function parseFactsJson(raw: unknown): UserFactDto[] {
  if (raw == null) return []
  let value: unknown = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw)
    } catch {
      return []
    }
  }
  try {
    return normalizeFacts(value)
  } catch {
    return []
  }
}

/**
 * 读取本机画像；无记录时返回空 facts。
 */
export async function getUserProfile(): Promise<UserProfileDto> {
  const prisma = getPrisma()
  const row = await prisma.user_profiles.findUnique({
    where: { id: LOCAL_PROFILE_ID }
  })
  if (!row) {
    return { facts: [], updatedAt: 0 }
  }
  return {
    facts: parseFactsJson(row.facts_json),
    updatedAt: new Date(row.updated_at).getTime()
  }
}

/**
 * 整包覆盖写入本机画像。
 *
 * @throws BadRequestError 当 body 非法时
 */
export async function putUserProfile(body: PutUserProfileRequest): Promise<UserProfileDto> {
  const prisma = getPrisma()
  const facts = normalizeFacts(body?.facts)
  const now = new Date().toISOString()

  await prisma.user_profiles.upsert({
    where: { id: LOCAL_PROFILE_ID },
    create: {
      id: LOCAL_PROFILE_ID,
      facts_json: JSON.stringify(facts),
      updated_at: now
    },
    update: {
      facts_json: JSON.stringify(facts),
      updated_at: now
    }
  })

  return {
    facts,
    updatedAt: new Date(now).getTime()
  }
}
