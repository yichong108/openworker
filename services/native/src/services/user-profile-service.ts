/**
 * 本机画像持久化 — 单行读写 facts_json（SQLite TEXT）
 */

import type { PutUserProfileRequest, UserFactDto, UserProfileDto } from '@openworker/shared'

import { BadRequestError } from '../http/envelope.js'
import { getDb, LOCAL_PROFILE_ID } from '../db/sqlite.js'

type ProfileRow = {
  id: string
  facts_json: string
  updated_at: string
}

const MAX_FACTS = 64

/**
 * 校验并规范化事实列表。
 *
 * @param facts - 原始 facts
 * @returns 规范化后的 UserFactDto[]
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
 * 解析 SQLite TEXT JSON 字段为事实数组。
 *
 * @param raw - facts_json
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
 *
 * @returns UserProfileDto
 */
export async function getUserProfile(): Promise<UserProfileDto> {
  const row = getDb()
    .prepare(
      `SELECT id, facts_json, updated_at
       FROM user_profiles
       WHERE id = ?
       LIMIT 1`
    )
    .get(LOCAL_PROFILE_ID) as ProfileRow | undefined
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
 * @param body - PutUserProfileRequest
 * @returns 写入后的 UserProfileDto
 * @throws BadRequestError 当 body 非法时
 */
export async function putUserProfile(body: PutUserProfileRequest): Promise<UserProfileDto> {
  const facts = normalizeFacts(body?.facts)
  const now = new Date().toISOString()
  getDb()
    .prepare(
      `INSERT INTO user_profiles (id, facts_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         facts_json = excluded.facts_json,
         updated_at = excluded.updated_at`
    )
    .run(LOCAL_PROFILE_ID, JSON.stringify(facts), now)
  return {
    facts,
    updatedAt: new Date(now).getTime()
  }
}
