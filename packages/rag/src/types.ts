/**
 * 单条检索命中结果
 *
 * `id` 一般为 `{documentId}#{chunkIndex}`；`metadata.documentId` 指向原文档。
 */
export type RagNode = {
  id: string
  text: string
  score?: number
  metadata?: Record<string, unknown>
}

/**
 * 写入 / 更新文档时的入参
 */
export type UpsertDocumentInput = {
  id: string
  text: string
  metadata?: Record<string, string>
}

/**
 * 关键词 / 语义检索的查询入参
 */
export type RagQueryInput = {
  text: string
  topK?: number
}

/**
 * 检索返回
 */
export type RagQueryResult = {
  nodes: RagNode[]
}

/**
 * 单库 RAG 存储抽象
 *
 * 无 embedding 时为关键词实现；配置 Ollama embedding 时走 LlamaIndex 语义检索。
 */
export type RagStore = {
  /**
   * 写入或覆盖一篇文档及其分块索引
   *
   * @param input - 文档 id、全文与可选元数据
   */
  upsertDocument(input: UpsertDocumentInput): Promise<void>

  /**
   * 从索引中删除指定文档的全部分块
   *
   * @param id - 文档 id
   */
  deleteDocument(id: string): Promise<void>

  /**
   * 按查询文本检索相关分块
   *
   * @param input - 查询文本与可选 topK
   * @returns 命中节点列表；无命中时 `nodes` 为空数组
   */
  query(input: RagQueryInput): Promise<RagQueryResult>
}

/**
 * Ollama embedding 配置（可选注入 embedModel 供测试）
 */
export type RagOllamaEmbeddingOptions = {
  provider: 'ollama'
  model: string
  baseUrl: string
  /**
   * 可选：注入自定义 Embedding（须实现 getTextEmbedding）
   *
   * 用于单测；生产路径由 OllamaEmbedding 创建。
   */
  embedModel?: {
    getTextEmbedding(text: string): Promise<number[]>
  }
}

/**
 * 创建 RagStore 的选项
 */
export type CreateRagStoreOptions = {
  /** 该知识库的本地持久化目录（含 index.json / llamaindex/） */
  persistDir: string
  /** 未设置时使用关键词索引；provider=ollama 时使用 LlamaIndex 语义索引 */
  embedding?: RagOllamaEmbeddingOptions
}
