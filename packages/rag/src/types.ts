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
 * 关键词 / 后续语义检索的查询入参
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
 * MVP 为关键词实现；后续可替换为向量语义实现，保持方法签名不变。
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
 * 创建 RagStore 的选项
 */
export type CreateRagStoreOptions = {
  /** 该知识库的本地持久化目录（含 index.json） */
  persistDir: string
}
