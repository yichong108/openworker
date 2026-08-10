import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createRagStore } from '../src/create-rag-store.js'
import { scoreChunk, splitIntoChunks, tokenize } from '../src/keyword.js'

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
})
