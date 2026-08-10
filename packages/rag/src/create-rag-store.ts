import { DEFAULT_TOP_K, scoreChunk, splitIntoChunks, tokenize, truncateSnippet } from './keyword.js'
import { loadKeywordIndex, saveKeywordIndex } from './index-file.js'
import type {
  CreateRagStoreOptions,
  RagQueryInput,
  RagQueryResult,
  RagStore,
  UpsertDocumentInput
} from './types.js'

/**
 * 创建基于本地 `index.json` 的关键词 RagStore
 *
 * 不依赖 Embedding / LlamaIndex；后续可用同接口替换为语义实现。
 *
 * @param options - 含 persistDir
 * @returns RagStore 实例
 */
export function createRagStore(options: CreateRagStoreOptions): RagStore {
  const persistDir = options.persistDir
  /** 进程内串行化同一目录的写操作，避免并发 upsert 互相覆盖 */
  let writeChain: Promise<void> = Promise.resolve()

  const withWriteLock = async <T>(fn: () => Promise<T>): Promise<T> => {
    const run = writeChain.then(fn, fn)
    writeChain = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  return {
    async upsertDocument(input: UpsertDocumentInput): Promise<void> {
      const id = input.id.trim()
      if (!id) {
        throw new Error('document id is required')
      }
      const text = input.text ?? ''
      await withWriteLock(async () => {
        const index = await loadKeywordIndex(persistDir)
        index.documents[id] = {
          id,
          text,
          metadata: input.metadata,
          chunks: splitIntoChunks(text),
          updatedAt: Date.now()
        }
        await saveKeywordIndex(persistDir, index)
      })
    },

    async deleteDocument(id: string): Promise<void> {
      const docId = id.trim()
      if (!docId) return
      await withWriteLock(async () => {
        const index = await loadKeywordIndex(persistDir)
        if (!(docId in index.documents)) return
        delete index.documents[docId]
        await saveKeywordIndex(persistDir, index)
      })
    },

    async query(input: RagQueryInput): Promise<RagQueryResult> {
      const topK = Math.max(1, input.topK ?? DEFAULT_TOP_K)
      const queryTokens = tokenize(input.text ?? '')
      if (queryTokens.length === 0) {
        return { nodes: [] }
      }

      const index = await loadKeywordIndex(persistDir)
      const scored: Array<{
        id: string
        text: string
        score: number
        metadata: Record<string, unknown>
      }> = []

      for (const doc of Object.values(index.documents)) {
        const chunks = doc.chunks.length > 0 ? doc.chunks : [doc.text]
        chunks.forEach((chunk, i) => {
          const score = scoreChunk(queryTokens, chunk)
          if (score <= 0) return
          scored.push({
            id: `${doc.id}#${i}`,
            text: truncateSnippet(chunk),
            score,
            metadata: {
              documentId: doc.id,
              chunkIndex: i,
              ...(doc.metadata ?? {})
            }
          })
        })
      }

      scored.sort((a, b) => b.score - a.score)
      return {
        nodes: scored.slice(0, topK).map((n) => ({
          id: n.id,
          text: n.text,
          score: n.score,
          metadata: n.metadata
        }))
      }
    }
  }
}
