import type { RagQueryNode, RagQueryRequest, RagQueryResponse } from '@openworker/shared'

import { BadRequestError, NotFoundError } from '../http/envelope.js'
import { env } from '../config/env.js'
import { getKnowledgeBase, listKnowledgeBases } from './knowledge-base-service.js'
import { getRagStore } from './rag-store-registry.js'

const DEFAULT_TOP_K = 5

/**
 * 调用 OpenAI 兼容 Chat Completions，基于检索片段生成回答
 *
 * @param query - 用户问题
 * @param nodes - 检索命中
 * @returns 模型回答文本
 * @throws 当未配置 LLM 或上游失败时抛出
 */
async function generateAnswer(query: string, nodes: RagQueryNode[]): Promise<string> {
  const { apiKey, baseURL, model } = env.ragLlm
  if (!apiKey || !model) {
    throw new BadRequestError('RAG LLM is not configured (set RAG_LLM_API_KEY and RAG_LLM_MODEL)')
  }

  const context = nodes
    .map((n, i) => {
      const source = [n.knowledgeBaseName, n.documentId].filter(Boolean).join(' / ')
      return `[${i + 1}] (${source})\n${n.text}`
    })
    .join('\n\n')

  const endpoint = `${(baseURL ?? 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            '你是知识库助手。仅根据提供的检索片段回答用户问题；若片段不足，明确说明无法从知识库得出结论。使用简体中文。'
        },
        {
          role: 'user',
          content: `检索片段：\n${context || '（无）'}\n\n用户问题：${query}`
        }
      ]
    })
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`RAG LLM request failed: HTTP ${response.status} ${body.slice(0, 500)}`)
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = json.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('RAG LLM returned empty content')
  return content
}

/**
 * 在单个知识库内执行检索，并为节点标注库信息
 *
 * @param knowledgeBaseId - 知识库 id
 * @param knowledgeBaseName - 知识库名称
 * @param query - 查询文本
 * @param topK - 返回条数
 */
async function queryOneKnowledgeBase(
  knowledgeBaseId: string,
  knowledgeBaseName: string,
  query: string,
  topK: number
): Promise<RagQueryNode[]> {
  const store = getRagStore(knowledgeBaseId)
  const { nodes } = await store.query({ text: query, topK })
  return nodes.map((n) => ({
    id: n.id,
    text: n.text,
    score: n.score,
    documentId: typeof n.metadata?.documentId === 'string' ? n.metadata.documentId : undefined,
    knowledgeBaseId,
    knowledgeBaseName,
    metadata: n.metadata
  }))
}

/**
 * 执行 RAG 检索（可选单库 / 全库合并），可选 LLM 回答
 *
 * @param body - 查询请求
 * @returns 命中节点与可选 answer
 */
export async function queryRag(body: RagQueryRequest): Promise<RagQueryResponse> {
  const query = body.query?.trim()
  if (!query) throw new BadRequestError('query is required')
  const topK = Math.max(1, Math.min(50, body.topK ?? DEFAULT_TOP_K))
  const withAnswer = Boolean(body.withAnswer)

  let nodes: RagQueryNode[] = []

  if (body.knowledgeBaseId?.trim()) {
    const kb = await getKnowledgeBase(body.knowledgeBaseId.trim())
    nodes = await queryOneKnowledgeBase(kb.id, kb.name, query, topK)
  } else {
    const bases = await listKnowledgeBases()
    const perKb = await Promise.all(
      bases.map((kb) => queryOneKnowledgeBase(kb.id, kb.name, query, topK))
    )
    nodes = perKb
      .flat()
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, topK)
  }

  if (!withAnswer) {
    return { nodes }
  }

  if (nodes.length === 0) {
    return { nodes, answer: '知识库中未检索到相关内容，无法生成回答。' }
  }

  try {
    const answer = await generateAnswer(query, nodes)
    return { nodes, answer }
  } catch (error) {
    if (error instanceof BadRequestError) throw error
    if (error instanceof NotFoundError) throw error
    throw error
  }
}
