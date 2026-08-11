import type {
  CreateSessionRequest,
  PatchSessionRequest,
  SessionDto,
  SessionMessagesPayload
} from '@openworker/shared'
import { randomUUID } from 'node:crypto'

import { BadRequestError, NotFoundError } from '../http/envelope.js'
import { getDb } from '../db/sqlite.js'
import { getWorkspace } from './workspace-service.js'

type SessionRow = {
  id: string
  workspace_id: string
  name: string
  messages_json?: string
  created_at: string
  updated_at: string
}

/**
 * 将 SQLite 行映射为 SessionDto（不含 messages）
 *
 * @param row - sessions 表行
 */
function toDto(row: SessionRow): SessionDto {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime()
  }
}

/**
 * 解析 messages_json 列为 unknown[]
 *
 * @param raw - SQLite TEXT JSON 字段
 */
function parseMessagesJson(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

/**
 * 列出工作区下未删除会话（不含 messages_json）
 *
 * @param workspaceId - 工作区 id
 */
export async function listSessions(workspaceId: string): Promise<SessionDto[]> {
  await getWorkspace(workspaceId)
  const rows = getDb()
    .prepare(
      `SELECT id, workspace_id, name, created_at, updated_at
       FROM sessions
       WHERE workspace_id = ? AND deleted_at IS NULL
       ORDER BY updated_at DESC`
    )
    .all(workspaceId) as SessionRow[]
  return rows.map(toDto)
}

/**
 * 获取未删除会话元数据
 *
 * @param sessionId - 会话 id
 */
export async function getSession(sessionId: string): Promise<SessionDto> {
  const row = getDb()
    .prepare(
      `SELECT id, workspace_id, name, created_at, updated_at
       FROM sessions
       WHERE id = ? AND deleted_at IS NULL
       LIMIT 1`
    )
    .get(sessionId) as SessionRow | undefined
  if (!row) throw new NotFoundError('Session not found')
  return toDto(row)
}

/**
 * 在指定工作区创建会话
 *
 * @param workspaceId - 工作区 id
 * @param body - 创建请求
 */
export async function createSession(
  workspaceId: string,
  body: CreateSessionRequest
): Promise<SessionDto> {
  await getWorkspace(workspaceId)

  const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : randomUUID()
  const name =
    typeof body.name === 'string' && body.name.trim()
      ? body.name.trim()
      : `会话 ${new Date().toLocaleString()}`

  const now = new Date().toISOString()
  try {
    getDb()
      .prepare(
        `INSERT INTO sessions (id, workspace_id, name, messages_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, workspaceId, name, JSON.stringify([]), now, now)
  } catch (error) {
    const err = error as { code?: string; message?: string }
    // SQLite unique / primary key conflict
    if (
      err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' ||
      err.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
      (typeof err.message === 'string' && err.message.includes('UNIQUE'))
    ) {
      throw new BadRequestError('Session id already exists')
    }
    throw error
  }

  return {
    id,
    workspaceId,
    name,
    createdAt: new Date(now).getTime(),
    updatedAt: new Date(now).getTime()
  }
}

/**
 * 部分更新会话（重命名 / touch）
 *
 * @param sessionId - 会话 id
 * @param body - 补丁
 */
export async function patchSession(
  sessionId: string,
  body: PatchSessionRequest
): Promise<SessionDto> {
  await getSession(sessionId)

  const sets: string[] = []
  const params: Array<string | number | null> = []

  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) throw new BadRequestError('name cannot be empty')
    sets.push('name = ?')
    params.push(name)
  }
  if (body.touch === true) {
    sets.push('updated_at = ?')
    params.push(new Date().toISOString())
  } else if (sets.length > 0) {
    sets.push('updated_at = ?')
    params.push(new Date().toISOString())
  }

  if (sets.length === 0) {
    return getSession(sessionId)
  }

  params.push(sessionId)
  getDb()
    .prepare(
      `UPDATE sessions SET ${sets.join(', ')}
       WHERE id = ? AND deleted_at IS NULL`
    )
    .run(...params)
  return getSession(sessionId)
}

/**
 * 软删会话
 *
 * @param sessionId - 会话 id
 */
export async function softDeleteSession(sessionId: string): Promise<void> {
  await getSession(sessionId)
  const now = new Date().toISOString()
  const result = getDb()
    .prepare(
      `UPDATE sessions SET deleted_at = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`
    )
    .run(now, now, sessionId)
  if (result.changes === 0) {
    throw new NotFoundError('Session not found')
  }
}

/**
 * 读取会话完整 Message[]
 *
 * @param sessionId - 会话 id
 */
export async function getSessionMessages(sessionId: string): Promise<SessionMessagesPayload> {
  const row = getDb()
    .prepare(
      `SELECT id, workspace_id, name, messages_json, created_at, updated_at
       FROM sessions
       WHERE id = ? AND deleted_at IS NULL
       LIMIT 1`
    )
    .get(sessionId) as SessionRow | undefined
  if (!row) throw new NotFoundError('Session not found')
  return { messages: parseMessagesJson(row.messages_json) }
}

/**
 * 整包覆盖会话 Message[]，并刷新 updated_at
 *
 * @param sessionId - 会话 id
 * @param payload - `{ messages: Message[] }`
 */
export async function putSessionMessages(
  sessionId: string,
  payload: SessionMessagesPayload
): Promise<SessionMessagesPayload> {
  if (!payload || !Array.isArray(payload.messages)) {
    throw new BadRequestError('messages must be an array')
  }

  await getSession(sessionId)

  const json = JSON.stringify(payload.messages)
  const now = new Date().toISOString()
  const result = getDb()
    .prepare(
      `UPDATE sessions
       SET messages_json = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`
    )
    .run(json, now, sessionId)
  if (result.changes === 0) {
    throw new NotFoundError('Session not found')
  }
  return { messages: payload.messages }
}

/**
 * 统计未删除会话数（可选按工作区）
 *
 * @param workspaceId - 可选工作区过滤
 */
export async function countActiveSessions(workspaceId?: string): Promise<number> {
  if (workspaceId) {
    const row = getDb()
      .prepare(
        `SELECT COUNT(*) AS cnt FROM sessions
         WHERE workspace_id = ? AND deleted_at IS NULL`
      )
      .get(workspaceId) as { cnt: number }
    return Number(row?.cnt ?? 0)
  }
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS cnt FROM sessions
       WHERE deleted_at IS NULL`
    )
    .get() as { cnt: number }
  return Number(row?.cnt ?? 0)
}
