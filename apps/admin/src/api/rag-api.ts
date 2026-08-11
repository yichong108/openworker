import type { RagQueryRequest, RagQueryResponse } from '@openworker/shared'

import { getRequestErrorMessage, request } from './request'

/**
 * 调用 RAG 检索接口（语义或关键词，由 API 配置决定）
 *
 * @param body - 查询参数（knowledgeBaseId 可选）
 * @returns 命中片段与可选回答
 */
export async function queryRag(body: RagQueryRequest): Promise<RagQueryResponse> {
  const result = await request<RagQueryResponse>({
    url: '/rag/query',
    method: 'POST',
    data: body
  })
  if (!result.ok) throw new Error(getRequestErrorMessage(result))
  return result.data ?? { nodes: [] }
}
