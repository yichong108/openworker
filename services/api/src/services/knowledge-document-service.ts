import type { KnowledgeDocument, KnowledgeDocumentStatus } from '@openworker/shared'
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { BadRequestError, NotFoundError } from '../http/envelope.js'
import { mysqlPool } from '../db/mysql.js'
import { getKnowledgeBase } from './knowledge-base-service.js'
import {
  ensureKnowledgeBaseDirs,
  getKnowledgeBaseFilesDir,
  getRagStore
} from './rag-store-registry.js'

/** 允许上传的扩展名（小写，含点） */
const ALLOWED_EXTENSIONS = new Set(['.txt', '.md', '.markdown'])

type DocumentRow = RowDataPacket & {
  id: string
  knowledge_base_id: string
  filename: string
  mime_type: string
  byte_size: number
  status: string
  error_message: string | null
  created_at: Date
  updated_at: Date
}

/**
 * 将 MySQL 行映射为 KnowledgeDocument
 *
 * @param row - knowledge_documents 表行
 */
function toDto(row: DocumentRow): KnowledgeDocument {
  return {
    id: row.id,
    knowledgeBaseId: row.knowledge_base_id,
    filename: row.filename,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    status: row.status as KnowledgeDocumentStatus,
    errorMessage: row.error_message,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime()
  }
}

/**
 * 根据文件名解析扩展名（小写）
 *
 * @param filename - 原始文件名
 */
function getExtension(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  return ext
}

/**
 * 校验上传文件类型是否为允许的文本格式
 *
 * @param filename - 文件名
 * @throws {BadRequestError} 扩展名不支持时
 */
export function assertAllowedDocumentFilename(filename: string): void {
  const ext = getExtension(filename)
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new BadRequestError('Only .txt, .md, .markdown files are supported')
  }
}

/**
 * 列出知识库下未删除的文档
 *
 * @param knowledgeBaseId - 知识库 id
 */
export async function listKnowledgeDocuments(
  knowledgeBaseId: string
): Promise<KnowledgeDocument[]> {
  await getKnowledgeBase(knowledgeBaseId)
  const [rows] = await mysqlPool.query<DocumentRow[]>(
    `SELECT id, knowledge_base_id, filename, mime_type, byte_size, status, error_message,
            created_at, updated_at
     FROM knowledge_documents
     WHERE knowledge_base_id = ? AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [knowledgeBaseId]
  )
  return rows.map(toDto)
}

/**
 * 上传文本文档：落盘、写入关键词索引、更新状态
 *
 * @param knowledgeBaseId - 知识库 id
 * @param file - multer 文件（含 buffer）
 * @returns 文档 DTO
 */
export async function uploadKnowledgeDocument(
  knowledgeBaseId: string,
  file: {
    originalname: string
    mimetype: string
    size: number
    buffer: Buffer
  }
): Promise<KnowledgeDocument> {
  await getKnowledgeBase(knowledgeBaseId)
  const filename = path.basename(file.originalname || 'untitled.txt')
  assertAllowedDocumentFilename(filename)

  const id = randomUUID()
  const ext = getExtension(filename)
  const mimeType = file.mimetype || 'text/plain'
  const byteSize = file.size
  const now = new Date()
  const text = file.buffer.toString('utf8')

  await ensureKnowledgeBaseDirs(knowledgeBaseId)
  const filesDir = getKnowledgeBaseFilesDir(knowledgeBaseId)
  await mkdir(filesDir, { recursive: true })
  const diskPath = path.join(filesDir, `${id}${ext}`)

  await mysqlPool.query<ResultSetHeader>(
    `INSERT INTO knowledge_documents
      (id, knowledge_base_id, filename, mime_type, byte_size, status, error_message, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', NULL, ?, ?)`,
    [id, knowledgeBaseId, filename, mimeType, byteSize, now, now]
  )

  try {
    await writeFile(diskPath, file.buffer)
    const store = getRagStore(knowledgeBaseId)
    await store.upsertDocument({
      id,
      text,
      metadata: { filename }
    })
    const readyAt = new Date()
    await mysqlPool.query<ResultSetHeader>(
      `UPDATE knowledge_documents
       SET status = 'ready', error_message = NULL, updated_at = ?
       WHERE id = ?`,
      [readyAt, id]
    )
    return {
      id,
      knowledgeBaseId,
      filename,
      mimeType,
      byteSize,
      status: 'ready',
      errorMessage: null,
      createdAt: now.getTime(),
      updatedAt: readyAt.getTime()
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const errAt = new Date()
    await mysqlPool.query<ResultSetHeader>(
      `UPDATE knowledge_documents
       SET status = 'error', error_message = ?, updated_at = ?
       WHERE id = ?`,
      [message.slice(0, 2000), errAt, id]
    )
    try {
      await unlink(diskPath)
    } catch {
      // ignore cleanup failure
    }
    throw error
  }
}

/**
 * 软删除文档，并从关键词索引与磁盘移除
 *
 * @param knowledgeBaseId - 知识库 id
 * @param documentId - 文档 id
 */
export async function softDeleteKnowledgeDocument(
  knowledgeBaseId: string,
  documentId: string
): Promise<void> {
  await getKnowledgeBase(knowledgeBaseId)
  const [rows] = await mysqlPool.query<DocumentRow[]>(
    `SELECT id, knowledge_base_id, filename, mime_type, byte_size, status, error_message,
            created_at, updated_at
     FROM knowledge_documents
     WHERE id = ? AND knowledge_base_id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [documentId, knowledgeBaseId]
  )
  const row = rows[0]
  if (!row) throw new NotFoundError('Document not found')

  const now = new Date()
  await mysqlPool.query<ResultSetHeader>(
    `UPDATE knowledge_documents
     SET deleted_at = ?, updated_at = ?
     WHERE id = ?`,
    [now, now, documentId]
  )

  const store = getRagStore(knowledgeBaseId)
  await store.deleteDocument(documentId)

  const ext = getExtension(row.filename)
  const diskPath = path.join(getKnowledgeBaseFilesDir(knowledgeBaseId), `${documentId}${ext}`)
  try {
    await unlink(diskPath)
  } catch {
    // 文件可能已不存在
  }
}
