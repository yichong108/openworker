import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createRagStore } from '../src/create-rag-store.js'
import { saveKeywordIndex } from '../src/index-file.js'
import { scoreChunk, splitIntoChunks, tokenize } from '../src/keyword.js'

/**
 * 确定性假 embedding：按 token 哈希到固定维度，便于无 Ollama 的单测
 */
function mockEmbed(text: string): number[] {
  const dim = 32
  const vec = new Array<number>(dim).fill(0)
  const tokens = text.toLowerCase().split(/\s+/).filter(Boolean)
  for (const t of tokens) {
    let h = 0
    for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0
    vec[h % dim] += 1
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1
  return vec.map((v) => v / norm)
}

describe('tokenize', () => {
  it('splits CJK and latin', () => {
    expect(tokenize('Hello 知识库 RAG')).toEqual(['hello', '知', '识', '库', 'rag'])
  })
})

describe('splitIntoChunks', () => {
  it('splits on blank lines', () => {
    const chunks = splitIntoChunks('第一段\n\n第二段')
    expect(chunks).toEqual(['第一段', '第二段'])
  })
})

describe('scoreChunk', () => {
  it('scores higher when more query tokens hit', () => {
    const q = tokenize('知识库')
    expect(scoreChunk(q, '这是知识库说明')).toBeGreaterThan(scoreChunk(q, '无关内容'))
  })
})

describe('createRagStore', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
  })

  it('upserts and queries documents', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ow-rag-'))
    dirs.push(dir)
    const store = createRagStore({ persistDir: dir })

    await store.upsertDocument({
      id: 'd1',
      text: 'OpenWorker 知识库支持关键词检索。\n\n第二段讲语义化。',
      metadata: { filename: 'a.md' }
    })

    const { nodes } = await store.query({ text: '关键词', topK: 3 })
    expect(nodes.length).toBeGreaterThan(0)
    expect(nodes[0]?.metadata?.documentId).toBe('d1')
    expect(nodes[0]?.text).toContain('关键词')

    await store.deleteDocument('d1')
    const after = await store.query({ text: '关键词', topK: 3 })
    expect(after.nodes).toEqual([])
  })

  it('semantic store upserts queries and deletes with mock embedding', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ow-rag-sem-'))
    dirs.push(dir)
    const store = createRagStore({
      persistDir: dir,
      embedding: {
        provider: 'ollama',
        model: 'mock',
        baseUrl: 'http://127.0.0.1:9',
        embedModel: { getTextEmbedding: async (text) => mockEmbed(text) }
      }
    })

    await store.upsertDocument({
      id: 'd1',
      text: 'OpenWorker knowledge base supports semantic retrieval with embeddings.',
      metadata: { filename: 'a.md' }
    })

    const { nodes } = await store.query({ text: 'semantic embeddings', topK: 3 })
    expect(nodes.length).toBeGreaterThan(0)
    expect(nodes[0]?.metadata?.documentId).toBe('d1')

    await store.deleteDocument('d1')
    const after = await store.query({ text: 'semantic embeddings', topK: 3 })
    expect(after.nodes).toEqual([])
  })

  it('migrates keyword v1 index into semantic store', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ow-rag-mig-'))
    dirs.push(dir)
    await saveKeywordIndex(dir, {
      version: 1,
      documents: {
        old1: {
          id: 'old1',
          text: 'legacy keyword document about pineapple juice',
          chunks: ['legacy keyword document about pineapple juice'],
          updatedAt: Date.now()
        }
      }
    })

    const store = createRagStore({
      persistDir: dir,
      embedding: {
        provider: 'ollama',
        model: 'mock',
        baseUrl: 'http://127.0.0.1:9',
        embedModel: { getTextEmbedding: async (text) => mockEmbed(text) }
      }
    })

    const { nodes } = await store.query({ text: 'pineapple', topK: 3 })
    expect(nodes.some((n) => n.metadata?.documentId === 'old1' || n.id.includes('old1'))).toBe(true)
  })

  it('falls back to keyword query when embedding fails', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ow-rag-fb-'))
    dirs.push(dir)
    let fail = false
    const store = createRagStore({
      persistDir: dir,
      embedding: {
        provider: 'ollama',
        model: 'mock',
        baseUrl: 'http://127.0.0.1:9',
        embedModel: {
          getTextEmbedding: async (text) => {
            if (fail) throw new Error('ollama down')
            return mockEmbed(text)
          }
        }
      }
    })

    await store.upsertDocument({
      id: 'd1',
      text: '回退测试：知识库关键词仍然可用。',
      metadata: { filename: 'b.md' }
    })

    fail = true
    const { nodes } = await store.query({ text: '关键词', topK: 3 })
    expect(nodes.length).toBeGreaterThan(0)
    expect(nodes[0]?.metadata?.documentId).toBe('d1')
  })
})
