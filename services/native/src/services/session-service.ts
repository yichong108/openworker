import type {
  CreateSessionRequest,
  PatchSessionRequest,
  SessionDto,
  SessionMessagesPayload
} from '@openworker/shared'
import { randomUUID } from 'node:crypto'

import { BadRequestError, NotFoundError } from '../http/envelope.js'
import { getPrisma } from '../db/prisma.js'
import { getWorkspace } from './workspace-service.js'

/**
 * 将 Prisma session 记录映射为 SessionDto（不含 messages）
 */
function toDto(row: {
  id: string
  workspace_id: string
  name: string
  created_at: string
  updated_at: string
}): SessionDto {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime()
  }
}

/**
 * 解析 messages_json 为 unknown[]
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
 */
export async function listSessions(workspaceId: string): Promise<SessionDto[]> {
  const prisma = getPrisma()
  await getWorkspace(workspaceId)

  const rows = await prisma.sessions.findMany({
    where: { workspace_id: workspaceId, deleted_at: null },
    orderBy: { updated_at: 'desc' },
    select: {
      id: true,
      workspace_id: true,
      name: true,
      created_at: true,
      updated_at: true
    }
  })
  return rows.map(toDto)
}

/**
 * 获取未删除会话元数据
 */
export async function getSession(sessionId: string): Promise<SessionDto> {
  const prisma = getPrisma()
  const row = await prisma.sessions.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      workspace_id: true,
      name: true,
      created_at: true,
      updated_at: true
    }
  })
  if (!row) throw new NotFoundError('Session not found')
  return toDto(row)
}

/**
 * 在指定工作区创建会话
 */
export async function createSession(
  workspaceId: string,
  body: CreateSessionRequest
): Promise<SessionDto> {
  const prisma = getPrisma()
  await getWorkspace(workspaceId)

  const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : randomUUID()
  const name =
    typeof body.name === 'string' && body.name.trim()
      ? body.name.trim()
      : `会话 ${new Date().toLocaleString()}`

  const now = new Date().toISOString()

  try {
    await prisma.sessions.create({
      data: {
        id,
        workspace_id: workspaceId,
        name,
        messages_json: JSON.stringify([]),
        created_at: now,
        updated_at: now
      }
    })
  } catch (error) {
    // Prisma P2002: 唯一约束冲突
    const err = error as { code?: string; message?: string }
    if (
      err.code === 'P2002' ||
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
 */
export async function patchSession(
  sessionId: string,
  body: PatchSessionRequest
): Promise<SessionDto> {
  const prisma = getPrisma()
  await getSession(sessionId)

  const data: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  }

  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) throw new BadRequestError('name cannot be empty')
    data.name = name
  }

  // 仅 touch 时保持 updated_at 更新，不额外改字段
  if (body.touch !== true && Object.keys(data).length <= 1) {
    return getSession(sessionId)
  }

  const row = await prisma.sessions.update({
    where: { id: sessionId, deleted_at: null },
    data,
    select: {
      id: true,
      workspace_id: true,
      name: true,
      created_at: true,
      updated_at: true
    }
  })
  return toDto(row)
}

/**
 * 软删会话
 */
export async function softDeleteSession(sessionId: string): Promise<void> {
  const prisma = getPrisma()
  await getSession(sessionId)

  const now = new Date().toISOString()
  await prisma.sessions.update({
    where: { id: sessionId, deleted_at: null },
    data: { deleted_at: now, updated_at: now }
  })
}

/**
 * 读取会话完整 Message[]
 */
export async function getSessionMessages(sessionId: string): Promise<SessionMessagesPayload> {
  const prisma = getPrisma()
  const row = await prisma.sessions.findUnique({
    where: { id: sessionId, deleted_at: null },
    select: { messages_json: true }
  })
  if (!row) throw new NotFoundError('Session not found')
  return { messages: parseMessagesJson(row.messages_json) }
}

/**
 * 整包覆盖会话 Message[]，并刷新 updated_at
 */
export async function putSessionMessages(
  sessionId: string,
  payload: SessionMessagesPayload
): Promise<SessionMessagesPayload> {
  const prisma = getPrisma()

  if (!payload || !Array.isArray(payload.messages)) {
    throw new BadRequestError('messages must be an array')
  }

  await getSession(sessionId)

  const now = new Date().toISOString()
  await prisma.sessions.update({
    where: { id: sessionId, deleted_at: null },
    data: {
      messages_json: JSON.stringify(payload.messages),
      updated_at: now
    }
  })
  return { messages: payload.messages }
}

/**
 * 统计未删除会话数（可选按工作区）
 */
export async function countActiveSessions(workspaceId?: string): Promise<number> {
  const prisma = getPrisma()
  if (workspaceId) {
    return prisma.sessions.count({
      where: { workspace_id: workspaceId, deleted_at: null }
    })
  }
  return prisma.sessions.count({ where: { deleted_at: null } })
}
