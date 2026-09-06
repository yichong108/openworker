import {
  HOME_WORKSPACE_ID,
  type CreateWorkspaceRequest,
  type PatchWorkspaceRequest,
  type WorkspaceDto
} from '@openworker/shared'
import { randomUUID } from 'node:crypto'

import { BadRequestError, NotFoundError } from '../http/envelope.js'
import { getPrisma } from '../db/prisma.js'

/**
 * 将 Prisma workspace 记录映射为 WorkspaceDto（epoch ms）
 */
function toDto(row: {
  id: string
  name: string
  path: string | null
  sort_order: number
  is_default: number
  created_at: string
  updated_at: string
}): WorkspaceDto {
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
 */
export async function ensureHomeWorkspace(): Promise<WorkspaceDto> {
  const prisma = getPrisma()

  let row = await prisma.workspaces.findUnique({
    where: { id: HOME_WORKSPACE_ID }
  })

  if (row && row.deleted_at == null) return toDto(row)

  const now = new Date().toISOString()

  if (row) {
    // 已软删，恢复
    row = await prisma.workspaces.update({
      where: { id: HOME_WORKSPACE_ID },
      data: {
        name: 'Home',
        sort_order: 0,
        is_default: 1,
        deleted_at: null,
        updated_at: now
      }
    })
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

  row = await prisma.workspaces.create({
    data: {
      id: HOME_WORKSPACE_ID,
      name: 'Home',
      path: null,
      sort_order: 0,
      is_default: 1,
      created_at: now,
      updated_at: now
    }
  })
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
  const prisma = getPrisma()
  const rows = await prisma.workspaces.findMany({
    where: { deleted_at: null },
    orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }]
  })
  if (rows.length === 0) {
    const home = await ensureHomeWorkspace()
    return [home]
  }
  return rows.map(toDto)
}

/**
 * 按 id 获取未删除工作区
 *
 * @throws {NotFoundError} 不存在或已软删
 */
export async function getWorkspace(workspaceId: string): Promise<WorkspaceDto> {
  const prisma = getPrisma()
  const row = await prisma.workspaces.findUnique({
    where: { id: workspaceId }
  })
  if (!row || row.deleted_at != null) throw new NotFoundError('Workspace not found')
  return toDto(row)
}

/**
 * 创建工作区
 */
export async function createWorkspace(body: CreateWorkspaceRequest): Promise<WorkspaceDto> {
  const prisma = getPrisma()

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) throw new BadRequestError('name is required')

  const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : randomUUID()
  const path =
    body.path === undefined || body.path === null
      ? null
      : typeof body.path === 'string'
        ? body.path
        : null

  // 获取当前最大 sort_order
  const maxRow = await prisma.workspaces.aggregate({
    where: { deleted_at: null },
    _max: { sort_order: true }
  })
  const sortOrder =
    typeof body.sortOrder === 'number' && Number.isFinite(body.sortOrder)
      ? Math.floor(body.sortOrder)
      : Number(maxRow._max.sort_order ?? -1) + 1

  const now = new Date().toISOString()
  const isDefault = body.isDefault === true ? 1 : 0

  // 若同 id 已软删，则恢复该行
  const existing = await prisma.workspaces.findUnique({ where: { id } })

  if (existing && existing.deleted_at == null) {
    throw new BadRequestError('Workspace id already exists')
  }

  let result
  if (existing) {
    result = await prisma.workspaces.update({
      where: { id },
      data: {
        name,
        path,
        sort_order: sortOrder,
        is_default: isDefault,
        deleted_at: null,
        updated_at: now
      }
    })
  } else {
    result = await prisma.workspaces.create({
      data: {
        id,
        name,
        path,
        sort_order: sortOrder,
        is_default: isDefault,
        created_at: now,
        updated_at: now
      }
    })
  }

  return {
    id: result.id,
    name: result.name,
    path: result.path,
    sortOrder: result.sort_order,
    createdAt: new Date(existing ? existing.created_at : now).getTime(),
    updatedAt: new Date(now).getTime(),
    isDefault: isDefault === 1 ? true : undefined
  }
}

/**
 * 部分更新工作区
 */
export async function patchWorkspace(
  workspaceId: string,
  body: PatchWorkspaceRequest
): Promise<WorkspaceDto> {
  const prisma = getPrisma()
  await getWorkspace(workspaceId)

  const data: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  }

  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) throw new BadRequestError('name cannot be empty')
    data.name = name
  }
  if (body.path !== undefined) {
    data.path = body.path === null ? null : String(body.path)
  }
  if (typeof body.isDefault === 'boolean') {
    data.is_default = body.isDefault ? 1 : 0
  }

  if (Object.keys(data).length <= 1) {
    // 只有 updated_at
    return getWorkspace(workspaceId)
  }

  const row = await prisma.workspaces.update({
    where: { id: workspaceId, deleted_at: null },
    data
  })
  return toDto(row)
}

/**
 * 按有序 id 列表重排未删除工作区
 */
export async function reorderWorkspaces(orderedIds: string[]): Promise<WorkspaceDto[]> {
  const prisma = getPrisma()

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    throw new BadRequestError('orderedIds must be a non-empty array')
  }

  const current = await listWorkspaces()
  const currentIds = new Set(current.map((w) => w.id))
  if (orderedIds.length !== currentIds.size || orderedIds.some((id) => !currentIds.has(id))) {
    throw new BadRequestError('orderedIds must match the full set of active workspaces')
  }

  const now = new Date().toISOString()

  // 用 $transaction 批量更新 sort_order
  await prisma.$transaction(
    orderedIds.map((id, i) =>
      prisma.workspaces.update({
        where: { id, deleted_at: null },
        data: { sort_order: i, updated_at: now }
      })
    )
  )

  return listWorkspaces()
}

/**
 * 软删工作区，并级联软删其下未删除会话
 */
export async function softDeleteWorkspace(workspaceId: string): Promise<void> {
  const prisma = getPrisma()
  await getWorkspace(workspaceId)

  const now = new Date().toISOString()

  await prisma.$transaction([
    prisma.sessions.updateMany({
      where: { workspace_id: workspaceId, deleted_at: null },
      data: { deleted_at: now, updated_at: now }
    }),
    prisma.workspaces.update({
      where: { id: workspaceId, deleted_at: null },
      data: { deleted_at: now, updated_at: now }
    })
  ])
}

/**
 * 统计未删除工作区数量（不含自动创建副作用）
 */
export async function countActiveWorkspaces(): Promise<number> {
  const prisma = getPrisma()
  return prisma.workspaces.count({ where: { deleted_at: null } })
}
