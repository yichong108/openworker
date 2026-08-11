import { createRagStore, type RagStore } from '@openworker/rag'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'

import { env } from '../config/env.js'

/** 按 knowledgeBaseId 缓存的 RagStore，避免重复读盘初始化逻辑 */
const storeCache = new Map<string, RagStore>()

/**
 * 解析知识库本地根目录
 *
 * @param knowledgeBaseId - 知识库 id
 */
export function getKnowledgeBaseDir(knowledgeBaseId: string): string {
  return path.resolve(env.ragDataDir, knowledgeBaseId)
}

/**
 * 解析知识库原文文件目录
 *
 * @param knowledgeBaseId - 知识库 id
 */
export function getKnowledgeBaseFilesDir(knowledgeBaseId: string): string {
  return path.join(getKnowledgeBaseDir(knowledgeBaseId), 'files')
}

/**
 * 获取（或创建并缓存）指定知识库的 RagStore
 *
 * 当 `RAG_EMBEDDING_PROVIDER=ollama` 时注入 Ollama embedding；否则为关键词索引。
 *
 * @param knowledgeBaseId - 知识库 id
 * @returns RagStore 实例
 */
export function getRagStore(knowledgeBaseId: string): RagStore {
  const cached = storeCache.get(knowledgeBaseId)
  if (cached) return cached
  const persistDir = getKnowledgeBaseDir(knowledgeBaseId)
  const store =
    env.ragEmbedding.provider === 'ollama'
      ? createRagStore({
          persistDir,
          embedding: {
            provider: 'ollama',
            model: env.ragEmbedding.ollamaEmbedModel,
            baseUrl: env.ragEmbedding.ollamaBaseUrl
          }
        })
      : createRagStore({ persistDir })
  storeCache.set(knowledgeBaseId, store)
  return store
}

/**
 * 确保知识库磁盘目录存在
 *
 * @param knowledgeBaseId - 知识库 id
 */
export async function ensureKnowledgeBaseDirs(knowledgeBaseId: string): Promise<void> {
  await mkdir(getKnowledgeBaseFilesDir(knowledgeBaseId), { recursive: true })
}

/**
 * 删除知识库本地目录并清除缓存
 *
 * @param knowledgeBaseId - 知识库 id
 */
export async function removeKnowledgeBaseDir(knowledgeBaseId: string): Promise<void> {
  storeCache.delete(knowledgeBaseId)
  await rm(getKnowledgeBaseDir(knowledgeBaseId), { recursive: true, force: true })
}

/**
 * 从缓存中移除指定知识库的 store（索引仍保留在磁盘）
 *
 * @param knowledgeBaseId - 知识库 id
 */
export function invalidateRagStore(knowledgeBaseId: string): void {
  storeCache.delete(knowledgeBaseId)
}
