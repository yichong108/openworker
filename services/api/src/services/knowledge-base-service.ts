import type {
  CreateKnowledgeBaseRequest,
  KnowledgeBase,
  UpdateKnowledgeBaseRequest
} from '@openworker/shared'
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { randomUUID } from 'node:crypto'

import { BadRequestError, NotFoundError } from '../http/envelope.js'
import { mysqlPool } from '../db/mysql.js'
import { ensureKnowledgeBaseDirs, removeKnowledgeBaseDir } from './rag-store-registry.js'

type KnowledgeBaseRow = RowDataPacket & {
  id: string
  name: string
  description: string | null
  created_at: Date
  updated_at: Date
}

/**
 * 将 MySQL 行映射为 KnowledgeBase DTO
 *
 * @param row - knowledge_bases 表行
 */
function toDto(row: KnowledgeBaseRow): KnowledgeBase {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime()
  }
}

/**
 * 列出未删除的知识库（按更新时间倒序）
 *
 * @returns 知识库列表
 */
export async function listKnowledgeBases(): Promise<KnowledgeBase[]> {
  const [rows] = await mysqlPool.query<KnowledgeBaseRow[]>(
    `SELECT id, name, description, created_at, updated_at
     FROM knowledge_bases
     WHERE deleted_at IS NULL
     ORDER BY updated_at DESC`
  )
  return rows.map(toDto)
}

/**
 * 获取未删除的知识库；不存在则抛 NotFoundError
 *
 * @param id - 知识库 id
 */
export async function getKnowledgeBase(id: string): Promise<KnowledgeBase> {
  const [rows] = await mysqlPool.query<KnowledgeBaseRow[]>(
    `SELECT id, name, description, created_at, updated_at
     FROM knowledge_bases
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [id]
  )
  const row = rows[0]
  if (!row) throw new NotFoundError('Knowledge base not found')
  return toDto(row)
}

/**
 * 创建知识库并准备本地目录
 *
 * @param body - 名称与可选描述
 * @returns 新建的知识库
 * @throws {BadRequestError} 名称为空时
 */
export async function createKnowledgeBase(
  body: CreateKnowledgeBaseRequest
): Promise<KnowledgeBase> {
  const name = body.name?.trim()
  if (!name) throw new BadRequestError('name is required')
  const description =
    body.description === undefined || body.description === null
      ? null
      : String(body.description).trim() || null
  const id = randomUUID()
  const now = new Date()

  await mysqlPool.query<ResultSetHeader>(
    `INSERT INTO knowledge_bases (id, name, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, name, description, now, now]
  )
  await ensureKnowledgeBaseDirs(id)
  return {
    id,
    name,
    description,
    createdAt: now.getTime(),
    updatedAt: now.getTime()
  }
}

/**
 * 更新知识库名称或描述
 *
 * @param id - 知识库 id
 * @param body - 可更新字段
 * @returns 更新后的知识库
 */
export async function updateKnowledgeBase(
  id: string,
  body: UpdateKnowledgeBaseRequest
): Promise<KnowledgeBase> {
  const existing = await getKnowledgeBase(id)
  const name = body.name === undefined ? existing.name : body.name.trim()
  if (!name) throw new BadRequestError('name is required')

  let description = existing.description
  if (body.description !== undefined) {
    description = body.description === null ? null : String(body.description).trim() || null
  }

  const now = new Date()
  await mysqlPool.query<ResultSetHeader>(
    `UPDATE knowledge_bases
     SET name = ?, description = ?, updated_at = ?
     WHERE id = ? AND deleted_at IS NULL`,
    [name, description, now, id]
  )
  return {
    ...existing,
    name,
    description,
    updatedAt: now.getTime()
  }
}

/**
 * 软删除知识库及其文档元数据，并清理本地磁盘目录
 *
 * @param id - 知识库 id
 */
export async function softDeleteKnowledgeBase(id: string): Promise<void> {
  await getKnowledgeBase(id)
  const now = new Date()
  await mysqlPool.query<ResultSetHeader>(
    `UPDATE knowledge_documents
     SET deleted_at = ?, updated_at = ?
     WHERE knowledge_base_id = ? AND deleted_at IS NULL`,
    [now, now, id]
  )
  await mysqlPool.query<ResultSetHeader>(
    `UPDATE knowledge_bases
     SET deleted_at = ?, updated_at = ?
     WHERE id = ? AND deleted_at IS NULL`,
    [now, now, id]
  )
  await removeKnowledgeBaseDir(id)
}
