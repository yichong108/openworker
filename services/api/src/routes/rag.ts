import { Router } from 'express'
import type { RagQueryRequest } from '@openworker/shared'

import { fail, ok, BadRequestError, NotFoundError } from '../http/envelope.js'
import { queryRag } from '../services/rag-query-service.js'

/**
 * RAG 检索路由（暂无鉴权，供 Admin 测试页使用）
 *
 * - POST /rag/query — 检索（语义或关键词）；可选 knowledgeBaseId / withAnswer
 */
export const ragRouter = Router()

ragRouter.post('/rag/query', async (req, res) => {
  try {
    const body = (req.body ?? {}) as RagQueryRequest
    const data = await queryRag(body)
    res.status(200).json(ok(data))
  } catch (error) {
    if (error instanceof BadRequestError) {
      res.status(200).json(fail(40050, error.message))
      return
    }
    if (error instanceof NotFoundError) {
      res.status(200).json(fail(40450, error.message))
      return
    }
    console.error('[api] POST /rag/query failed', error)
    res.status(200).json(fail(50050, error instanceof Error ? error.message : String(error)))
  }
})
