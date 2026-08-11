import { createKeywordRagStore } from './create-keyword-rag-store.js'
import { createSemanticRagStore } from './create-semantic-rag-store.js'
import type { CreateRagStoreOptions, RagStore } from './types.js'

/**
 * 创建单库 RagStore
 *
 * - 未配置 `embedding`：关键词 `index.json`（MVP）
 * - `embedding.provider === 'ollama'`：LlamaIndex + Ollama Embedding 语义检索（双写关键词以供回退）
 *
 * @param options - persistDir 与可选 embedding
 * @returns RagStore 实例
 */
export function createRagStore(options: CreateRagStoreOptions): RagStore {
  if (options.embedding?.provider === 'ollama') {
    return createSemanticRagStore({
      persistDir: options.persistDir,
      embedding: options.embedding
    })
  }
  return createKeywordRagStore({ persistDir: options.persistDir })
}
