import type {
  CreateKnowledgeBaseRequest,
  KnowledgeBase,
  KnowledgeDocument,
  UpdateKnowledgeBaseRequest
} from '@openworker/shared'

import { getRequestErrorMessage, request } from './request'

/**
 * 拉取知识库列表
 *
 * @returns 知识库数组
 * @throws 网络或业务失败时抛出 Error
 */
export async function fetchKnowledgeBases(): Promise<KnowledgeBase[]> {
  const result = await request<{ list: KnowledgeBase[] }>({
    url: '/knowledge-bases',
    method: 'GET'
  })
  if (!result.ok) throw new Error(getRequestErrorMessage(result))
  return result.data?.list ?? []
}

/**
 * 创建知识库
 *
 * @param body - 名称与可选描述
 */
export async function createKnowledgeBase(
  body: CreateKnowledgeBaseRequest
): Promise<KnowledgeBase> {
  const result = await request<{ knowledgeBase: KnowledgeBase }>({
    url: '/knowledge-bases',
    method: 'POST',
    data: body
  })
  if (!result.ok) throw new Error(getRequestErrorMessage(result))
  if (!result.data?.knowledgeBase) throw new Error('Empty knowledge base response')
  return result.data.knowledgeBase
}

/**
 * 更新知识库
 *
 * @param id - 知识库 id
 * @param body - 可更新字段
 */
export async function updateKnowledgeBase(
  id: string,
  body: UpdateKnowledgeBaseRequest
): Promise<KnowledgeBase> {
  const result = await request<{ knowledgeBase: KnowledgeBase }>({
    url: `/knowledge-bases/${encodeURIComponent(id)}`,
    method: 'PATCH',
    data: body
  })
  if (!result.ok) throw new Error(getRequestErrorMessage(result))
  if (!result.data?.knowledgeBase) throw new Error('Empty knowledge base response')
  return result.data.knowledgeBase
}

/**
 * 删除知识库
 *
 * @param id - 知识库 id
 */
export async function deleteKnowledgeBase(id: string): Promise<void> {
  const result = await request<{ ok: boolean }>({
    url: `/knowledge-bases/${encodeURIComponent(id)}`,
    method: 'DELETE'
  })
  if (!result.ok) throw new Error(getRequestErrorMessage(result))
}

/**
 * 拉取知识库文档列表
 *
 * @param knowledgeBaseId - 知识库 id
 */
export async function fetchKnowledgeDocuments(
  knowledgeBaseId: string
): Promise<KnowledgeDocument[]> {
  const result = await request<{ list: KnowledgeDocument[] }>({
    url: `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/documents`,
    method: 'GET'
  })
  if (!result.ok) throw new Error(getRequestErrorMessage(result))
  return result.data?.list ?? []
}

/**
 * 上传知识库文档（multipart 字段名 `file`）
 *
 * @param knowledgeBaseId - 知识库 id
 * @param file - 浏览器 File
 */
export async function uploadKnowledgeDocument(
  knowledgeBaseId: string,
  file: File
): Promise<KnowledgeDocument> {
  const form = new FormData()
  form.append('file', file)
  const result = await request<{ document: KnowledgeDocument }>({
    url: `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/documents`,
    method: 'POST',
    data: form
  })
  if (!result.ok) throw new Error(getRequestErrorMessage(result))
  if (!result.data?.document) throw new Error('Empty document response')
  return result.data.document
}

/**
 * 删除知识库文档
 *
 * @param knowledgeBaseId - 知识库 id
 * @param documentId - 文档 id
 */
export async function deleteKnowledgeDocument(
  knowledgeBaseId: string,
  documentId: string
): Promise<void> {
  const result = await request<{ ok: boolean }>({
    url: `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/documents/${encodeURIComponent(documentId)}`,
    method: 'DELETE'
  })
  if (!result.ok) throw new Error(getRequestErrorMessage(result))
}
