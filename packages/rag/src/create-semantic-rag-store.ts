import { OllamaEmbedding } from '@llamaindex/ollama'
import {
  BaseEmbedding,
  Document,
  MetadataMode,
  Settings,
  SimpleVectorStore,
  VectorStoreIndex,
  storageContextFromDefaults
} from 'llamaindex'
import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { createKeywordRagStore } from './create-keyword-rag-store.js'
import { loadKeywordIndex } from './index-file.js'
import { DEFAULT_TOP_K, truncateSnippet } from './keyword.js'
import type {
  CreateRagStoreOptions,
  RagOllamaEmbeddingOptions,
  RagQueryInput,
  RagQueryResult,
  RagStore,
  UpsertDocumentInput
} from './types.js'

const LLAMAINDEX_DIR_NAME = 'llamaindex'
const MIGRATED_MARKER = '.ow-migrated-from-v1'

/**
 * 将注入的轻量 embed 适配为 LlamaIndex BaseEmbedding
 *
 * Settings / SimpleVectorStore 需要完整 Embedding 实例；测试可只提供 getTextEmbedding。
 */
class InjectedEmbedding extends BaseEmbedding {
  constructor(private readonly inner: { getTextEmbedding(text: string): Promise<number[]> }) {
    super()
  }

  /**
   * 委托给注入实现生成文本向量
   *
   * @param text - 待嵌入文本
   * @returns 向量
   */
  async getTextEmbedding(text: string): Promise<number[]> {
    return this.inner.getTextEmbedding(text)
  }
}

/**
 * 解析 LlamaIndex 持久化子目录
 *
 * @param persistDir - 知识库根目录
 */
function getLlamaIndexDir(persistDir: string): string {
  return path.join(persistDir, LLAMAINDEX_DIR_NAME)
}

/**
 * 创建 Ollama 或注入的 Embedding 实例
 *
 * @param embedding - embedding 配置
 */
function createEmbedModel(embedding: RagOllamaEmbeddingOptions): BaseEmbedding {
  if (embedding.embedModel) {
    return new InjectedEmbedding(embedding.embedModel)
  }
  return new OllamaEmbedding({
    model: embedding.model,
    config: { host: embedding.baseUrl }
  })
}

/**
 * 在指定 embedModel 上下文中加载或创建 VectorStoreIndex
 *
 * 使用 Settings.withEmbedModel，避免多知识库并发时污染全局默认模型。
 *
 * @param llamaindexDir - 持久化目录
 * @param embedModel - embedding 模型
 */
async function loadOrCreateIndex(
  llamaindexDir: string,
  embedModel: BaseEmbedding
): Promise<VectorStoreIndex> {
  await mkdir(llamaindexDir, { recursive: true })
  return Settings.withEmbedModel(embedModel, async () => {
    const vectorStore = await SimpleVectorStore.fromPersistDir(llamaindexDir, embedModel)
    const storageContext = await storageContextFromDefaults({
      persistDir: llamaindexDir,
      vectorStore
    })
    const structs = await storageContext.indexStore.getIndexStructs()
    if (structs.length > 0) {
      return VectorStoreIndex.init({ storageContext })
    }
    return VectorStoreIndex.init({ storageContext, nodes: [] })
  })
}

/**
 * 若存在关键词 v1 索引且尚未迁移，则写入 LlamaIndex
 *
 * @param persistDir - 知识库根目录
 * @param keywordStore - 用于双写的关键词 store
 * @param getIndex - 懒加载语义索引
 */
async function migrateFromKeywordV1IfNeeded(
  persistDir: string,
  keywordStore: RagStore,
  getIndex: () => Promise<VectorStoreIndex>,
  embedModel: BaseEmbedding
): Promise<void> {
  const markerPath = path.join(getLlamaIndexDir(persistDir), MIGRATED_MARKER)
  try {
    await access(markerPath)
    return
  } catch {
    // 无标记则尝试迁移
  }

  const keywordIndex = await loadKeywordIndex(persistDir)
  const docs = Object.values(keywordIndex.documents)
  if (docs.length === 0) {
    await mkdir(getLlamaIndexDir(persistDir), { recursive: true })
    await writeFile(markerPath, `${new Date().toISOString()}\n`, 'utf8')
    return
  }

  const index = await getIndex()
  await Settings.withEmbedModel(embedModel, async () => {
    for (const doc of docs) {
      await index.deleteRefDoc(doc.id, true).catch(() => undefined)
      await index.insert(
        new Document({
          text: doc.text,
          id_: doc.id,
          metadata: {
            documentId: doc.id,
            ...(doc.metadata ?? {})
          }
        })
      )
    }
  })

  // 确保关键词侧仍完整（迁移不改动原文）
  for (const doc of docs) {
    await keywordStore.upsertDocument({
      id: doc.id,
      text: doc.text,
      metadata: doc.metadata
    })
  }

  await writeFile(markerPath, `${new Date().toISOString()}\n`, 'utf8')
}

/**
 * 创建基于 LlamaIndex + Ollama Embedding 的语义 RagStore
 *
 * 同时双写关键词 `index.json`，供 query 侧 embedding 失败时回退。
 *
 * @param options - persistDir 与 embedding 配置
 * @returns RagStore 实例
 */
export function createSemanticRagStore(
  options: CreateRagStoreOptions & { embedding: RagOllamaEmbeddingOptions }
): RagStore {
  const persistDir = options.persistDir
  const embedding = options.embedding
  const embedModel = createEmbedModel(embedding)
  const keywordStore = createKeywordRagStore({ persistDir })
  const llamaindexDir = getLlamaIndexDir(persistDir)

  let indexPromise: Promise<VectorStoreIndex> | null = null
  let migratePromise: Promise<void> | null = null
  let writeChain: Promise<void> = Promise.resolve()

  const withWriteLock = async <T>(fn: () => Promise<T>): Promise<T> => {
    const run = writeChain.then(fn, fn)
    writeChain = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  const getIndex = async (): Promise<VectorStoreIndex> => {
    if (!indexPromise) {
      indexPromise = loadOrCreateIndex(llamaindexDir, embedModel)
    }
    return indexPromise
  }

  const ensureMigrated = async (): Promise<void> => {
    if (!migratePromise) {
      migratePromise = migrateFromKeywordV1IfNeeded(persistDir, keywordStore, getIndex, embedModel)
    }
    await migratePromise
  }

  return {
    async upsertDocument(input: UpsertDocumentInput): Promise<void> {
      const id = input.id.trim()
      if (!id) {
        throw new Error('document id is required')
      }
      const text = input.text ?? ''
      await withWriteLock(async () => {
        await ensureMigrated()
        await keywordStore.upsertDocument({ id, text, metadata: input.metadata })
        const index = await getIndex()
        await Settings.withEmbedModel(embedModel, async () => {
          await index.deleteRefDoc(id, true).catch(() => undefined)
          await index.insert(
            new Document({
              text,
              id_: id,
              metadata: {
                documentId: id,
                ...(input.metadata ?? {})
              }
            })
          )
        })
      })
    },

    async deleteDocument(id: string): Promise<void> {
      const docId = id.trim()
      if (!docId) return
      await withWriteLock(async () => {
        await ensureMigrated()
        await keywordStore.deleteDocument(docId)
        const index = await getIndex()
        await Settings.withEmbedModel(embedModel, async () => {
          await index.deleteRefDoc(docId, true).catch(() => undefined)
        })
      })
    },

    async query(input: RagQueryInput): Promise<RagQueryResult> {
      const topK = Math.max(1, input.topK ?? DEFAULT_TOP_K)
      const queryText = (input.text ?? '').trim()
      if (!queryText) {
        return { nodes: [] }
      }

      try {
        await ensureMigrated()
        const index = await getIndex()
        const nodesWithScore = await Settings.withEmbedModel(embedModel, async () => {
          const retriever = index.asRetriever({ similarityTopK: topK })
          return retriever.retrieve({ query: queryText })
        })

        return {
          nodes: nodesWithScore.map((item, i) => {
            const node = item.node
            const rawText =
              typeof node.getContent === 'function'
                ? String(node.getContent(MetadataMode.NONE))
                : String(node)
            const text = truncateSnippet(rawText)
            const meta = (node.metadata ?? {}) as Record<string, unknown>
            const refDocId =
              'refDocId' in node && typeof (node as { refDocId?: unknown }).refDocId === 'string'
                ? (node as { refDocId: string }).refDocId
                : undefined
            const nodeId = typeof node.id_ === 'string' ? node.id_ : undefined
            const documentId =
              typeof meta.documentId === 'string'
                ? meta.documentId
                : (refDocId ?? (nodeId ? nodeId.split('#')[0] : undefined))
            return {
              id: nodeId ?? `${documentId ?? 'node'}#${i}`,
              text,
              score: item.score,
              metadata: {
                documentId,
                ...meta
              }
            }
          })
        }
      } catch {
        // Ollama / embedding 失败时回退关键词检索
        return keywordStore.query(input)
      }
    }
  }
}
