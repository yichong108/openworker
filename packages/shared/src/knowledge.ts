/**
 * 知识库文档索引状态
 */
export type KnowledgeDocumentStatus = 'pending' | 'ready' | 'error'

/**
 * 知识库 DTO
 */
export type KnowledgeBase = {
  id: string
  name: string
  description: string | null
  createdAt: number
  updatedAt: number
}

/**
 * 创建知识库请求
 */
export type CreateKnowledgeBaseRequest = {
  name: string
  description?: string | null
}

/**
 * 更新知识库请求
 */
export type UpdateKnowledgeBaseRequest = {
  name?: string
  description?: string | null
}

/**
 * 知识库文档 DTO
 */
export type KnowledgeDocument = {
  id: string
  knowledgeBaseId: string
  filename: string
  mimeType: string
  byteSize: number
  status: KnowledgeDocumentStatus
  errorMessage: string | null
  createdAt: number
  updatedAt: number
}

/**
 * RAG 查询请求
 *
 * `knowledgeBaseId` 可选：省略时在全部知识库中检索并合并 top-k。
 */
export type RagQueryRequest = {
  query: string
  knowledgeBaseId?: string
  topK?: number
  withAnswer?: boolean
}

/**
 * 单条检索命中（API 层，含知识库溯源）
 */
export type RagQueryNode = {
  id: string
  text: string
  score?: number
  documentId?: string
  knowledgeBaseId: string
  knowledgeBaseName?: string
  metadata?: Record<string, unknown>
}

/**
 * RAG 查询响应
 */
export type RagQueryResponse = {
  nodes: RagQueryNode[]
  answer?: string
}
