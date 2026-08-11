import {
  HOME_WORKSPACE_ID,
  type CreateWorkspaceRequest,
  type PatchWorkspaceRequest,
  type WorkspaceDto
} from '@openworker/shared'
import { randomUUID } from 'node:crypto'

import { BadRequestError, NotFoundError } from '../http/envelope.js'
import { getDb } from '../db/sqlite.js'

type WorkspaceRow = {
  id: string
  name: string
  path: string | null
  sort_order: number
  is_default: number
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

/**
 * 将 SQLite 行映射为 WorkspaceDto（epoch ms）
 *
 * @param row - workspaces 表行
 */
function toDto(row: WorkspaceRow): WorkspaceDto {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    sortOrder: row.sort_order,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    isDefault: row.is_default === 1 ? true : undefined
  }
}

/**
 * 确保存在未删除的 Home 工作区；没有则创建
 *
 * @returns Home 工作区 DTO
 */
export async function ensureHomeWorkspace(): Promise<WorkspaceDto> {
  const database = getDb()
  const row = database
    .prepare(
      `SELECT id, name, path, sort_order, is_default, created_at, updated_at, deleted_at
       FROM workspaces
       WHERE id = ?
       LIMIT 1`
    )
    .get(HOME_WORKSPACE_ID) as WorkspaceRow | undefined

  if (row && row.deleted_at == null) return toDto(row)

  const now = new Date().toISOString()
  // path 由 Desktop 本机写入，API 不猜测服务端 homedir
  if (row) {
    database
      .prepare(
        `UPDATE workspaces
         SET name = ?, sort_order = 0, is_default = 1, deleted_at = NULL, updated_at = ?
         WHERE id = ?`
      )
      .run('Home', now, HOME_WORKSPACE_ID)
    return {
      id: HOME_WORKSPACE_ID,
      name: 'Home',
      path: row.path,
      sortOrder: 0,
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(now).getTime(),
      isDefault: true
    }
  }

  database
    .prepare(
      `INSERT INTO workspaces (id, name, path, sort_order, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(HOME_WORKSPACE_ID, 'Home', null, 0, 1, now, now)
  return {
    id: HOME_WORKSPACE_ID,
    name: 'Home',
    path: null,
    sortOrder: 0,
    createdAt: new Date(now).getTime(),
    updatedAt: new Date(now).getTime(),
    isDefault: true
  }
}

/**
 * 列出未删除的工作区（按 sort_order、创建时间）
 *
 * 若列表为空则自动确保 Home 存在。
 */
export async function listWorkspaces(): Promise<WorkspaceDto[]> {
  const rows = getDb()
    .prepare(
      `SELECT id, name, path, sort_order, is_default, created_at, updated_at
       FROM workspaces
       WHERE deleted_at IS NULL
       ORDER BY sort_order ASC, created_at ASC`
    )
    .all() as WorkspaceRow[]
  if (rows.length === 0) {
    const home = await ensureHomeWorkspace()
    return [home]
  }
  return rows.map(toDto)
}

/**
 * 按 id 获取未删除工作区
 *
 * @param workspaceId - 工作区 id
 * @throws {NotFoundError} 不存在或已软删
 */
export async function getWorkspace(workspaceId: string): Promise<WorkspaceDto> {
  const row = getDb()
    .prepare(
      `SELECT id, name, path, sort_order, is_default, created_at, updated_at
       FROM workspaces
       WHERE id = ? AND deleted_at IS NULL
       LIMIT 1`
    )
    .get(workspaceId) as WorkspaceRow | undefined
  if (!row) throw new NotFoundError('Workspace not found')
  return toDto(row)
}

/**
 * 创建工作区
 *
 * @param body - 创建请求
 */
export async function createWorkspace(body: CreateWorkspaceRequest): Promise<WorkspaceDto> {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) throw new BadRequestError('name is required')

  const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : randomUUID()
  const path =
    body.path === undefined || body.path === null
      ? null
      : typeof body.path === 'string'
        ? body.path
        : null

  const maxRow = getDb()
    .prepare(
      `SELECT COALESCE(MAX(sort_order), -1) AS max_sort
       FROM workspaces WHERE deleted_at IS NULL`
    )
    .get() as { max_sort: number }
  const sortOrder =
    typeof body.sortOrder === 'number' && Number.isFinite(body.sortOrder)
      ? Math.floor(body.sortOrder)
      : Number(maxRow?.max_sort ?? -1) + 1

  const now = new Date().toISOString()
  const isDefault = body.isDefault === true ? 1 : 0

  // 若同 id 已软删，则恢复该行
  const existing = getDb()
    .prepare(
      `SELECT id, name, path, sort_order, is_default, created_at, updated_at, deleted_at
       FROM workspaces WHERE id = ? LIMIT 1`
    )
    .get(id) as WorkspaceRow | undefined

  if (existing && existing.deleted_at == null) {
    throw new BadRequestError('Workspace id already exists')
  }

  if (existing) {
    getDb()
      .prepare(
        `UPDATE workspaces
         SET name = ?, path = ?, sort_order = ?, is_default = ?, deleted_at = NULL, updated_at = ?
         WHERE id = ?`
      )
      .run(name, path, sortOrder, isDefault, now, id)
  } else {
    getDb()
      .prepare(
        `INSERT INTO workspaces (id, name, path, sort_order, is_default, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, name, path, sortOrder, isDefault, now, now)
  }

  return {
    id,
    name,
    path,
    sortOrder,
    createdAt: existing ? new Date(existing.created_at).getTime() : new Date(now).getTime(),
    updatedAt: new Date(now).getTime(),
    isDefault: isDefault === 1 ? true : undefined
  }
}

/**
 * 部分更新工作区
 *
 * @param workspaceId - 工作区 id
 * @param body - 补丁
 */
export async function patchWorkspace(
  workspaceId: string,
  body: PatchWorkspaceRequest
): Promise<WorkspaceDto> {
  await getWorkspace(workspaceId)

  const sets: string[] = []
  const params: Array<string | number | null> = []

  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) throw new BadRequestError('name cannot be empty')
    sets.push('name = ?')
    params.push(name)
  }
  if (body.path !== undefined) {
    sets.push('path = ?')
    params.push(body.path === null ? null : String(body.path))
  }
  if (typeof body.isDefault === 'boolean') {
    sets.push('is_default = ?')
    params.push(body.isDefault ? 1 : 0)
  }

  if (sets.length === 0) {
    return getWorkspace(workspaceId)
  }

  sets.push('updated_at = ?')
  params.push(new Date().toISOString())
  params.push(workspaceId)
  getDb()
    .prepare(
      `UPDATE workspaces SET ${sets.join(', ')}
       WHERE id = ? AND deleted_at IS NULL`
    )
    .run(...params)
  return getWorkspace(workspaceId)
}

/**
 * 按有序 id 列表重排未删除工作区
 *
 * @param orderedIds - 完整有序 id 列表
 */
export async function reorderWorkspaces(orderedIds: string[]): Promise<WorkspaceDto[]> {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    throw new BadRequestError('orderedIds must be a non-empty array')
  }

  const current = await listWorkspaces()
  const currentIds = new Set(current.map((w) => w.id))
  if (orderedIds.length !== currentIds.size || orderedIds.some((id) => !currentIds.has(id))) {
    throw new BadRequestError('orderedIds must match the full set of active workspaces')
  }

  const database = getDb()
  const now = new Date().toISOString()
  const update = database.prepare(
    `UPDATE workspaces SET sort_order = ?, updated_at = ?
     WHERE id = ? AND deleted_at IS NULL`
  )

  database.exec('BEGIN')
  try {
    for (let i = 0; i < orderedIds.length; i += 1) {
      update.run(i, now, orderedIds[i])
    }
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }

  return listWorkspaces()
}

/**
 * 软删工作区，并级联软删其下未删除会话
 *
 * @param workspaceId - 工作区 id
 */
export async function softDeleteWorkspace(workspaceId: string): Promise<void> {
  await getWorkspace(workspaceId)

  const database = getDb()
  const now = new Date().toISOString()
  database.exec('BEGIN')
  try {
    database
      .prepare(
        `UPDATE sessions SET deleted_at = ?, updated_at = ?
         WHERE workspace_id = ? AND deleted_at IS NULL`
      )
      .run(now, now, workspaceId)

    const result = database
      .prepare(
        `UPDATE workspaces SET deleted_at = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`
      )
      .run(now, now, workspaceId)

    if (result.changes === 0) {
      throw new NotFoundError('Workspace not found')
    }
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

/**
 * 统计未删除工作区数量（不含自动创建副作用）
 */
export async function countActiveWorkspaces(): Promise<number> {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS cnt FROM workspaces
       WHERE deleted_at IS NULL`
    )
    .get() as { cnt: number }
  return Number(row?.cnt ?? 0)
}
