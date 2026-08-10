import { Router } from 'express'
import type { CreateKnowledgeBaseRequest, UpdateKnowledgeBaseRequest } from '@openworker/shared'
import multer from 'multer'

import { fail, ok, BadRequestError, NotFoundError } from '../http/envelope.js'
import {
  createKnowledgeBase,
  getKnowledgeBase,
  listKnowledgeBases,
  softDeleteKnowledgeBase,
  updateKnowledgeBase
} from '../services/knowledge-base-service.js'
import {
  listKnowledgeDocuments,
  softDeleteKnowledgeDocument,
  uploadKnowledgeDocument
} from '../services/knowledge-document-service.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
})

/**
 * 将 Express 路由参数规范为单个 string
 *
 * @param value - `req.params` 中的值（可能为 string[]）
 * @returns 首个非空字符串；缺失时返回空串
 */
function paramString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

/**
 * 知识库与文档管理路由（暂无鉴权，供 Admin 使用）
 *
 * - GET/POST /knowledge-bases
 * - GET/PATCH/DELETE /knowledge-bases/:id
 * - GET/POST /knowledge-bases/:id/documents
 * - DELETE /knowledge-bases/:kbId/documents/:docId
 */
export const knowledgeBasesRouter = Router()

knowledgeBasesRouter.get('/knowledge-bases', async (_req, res) => {
  try {
    const list = await listKnowledgeBases()
    res.status(200).json(ok({ list }))
  } catch (error) {
    console.error('[api] GET /knowledge-bases failed', error)
    res.status(200).json(fail(50040, error instanceof Error ? error.message : String(error)))
  }
})

knowledgeBasesRouter.post('/knowledge-bases', async (req, res) => {
  try {
    const body = (req.body ?? {}) as CreateKnowledgeBaseRequest
    const knowledgeBase = await createKnowledgeBase(body)
    res.status(200).json(ok({ knowledgeBase }))
  } catch (error) {
    if (error instanceof BadRequestError) {
      res.status(200).json(fail(40040, error.message))
      return
    }
    console.error('[api] POST /knowledge-bases failed', error)
    res.status(200).json(fail(50041, error instanceof Error ? error.message : String(error)))
  }
})

knowledgeBasesRouter.get('/knowledge-bases/:id', async (req, res) => {
  try {
    const knowledgeBase = await getKnowledgeBase(paramString(req.params.id))
    res.status(200).json(ok({ knowledgeBase }))
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(200).json(fail(40440, error.message))
      return
    }
    console.error('[api] GET /knowledge-bases/:id failed', error)
    res.status(200).json(fail(50042, error instanceof Error ? error.message : String(error)))
  }
})

knowledgeBasesRouter.patch('/knowledge-bases/:id', async (req, res) => {
  try {
    const body = (req.body ?? {}) as UpdateKnowledgeBaseRequest
    const knowledgeBase = await updateKnowledgeBase(paramString(req.params.id), body)
    res.status(200).json(ok({ knowledgeBase }))
  } catch (error) {
    if (error instanceof BadRequestError) {
      res.status(200).json(fail(40041, error.message))
      return
    }
    if (error instanceof NotFoundError) {
      res.status(200).json(fail(40441, error.message))
      return
    }
    console.error('[api] PATCH /knowledge-bases/:id failed', error)
    res.status(200).json(fail(50043, error instanceof Error ? error.message : String(error)))
  }
})

knowledgeBasesRouter.delete('/knowledge-bases/:id', async (req, res) => {
  try {
    await softDeleteKnowledgeBase(paramString(req.params.id))
    res.status(200).json(ok({ ok: true }))
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(200).json(fail(40442, error.message))
      return
    }
    console.error('[api] DELETE /knowledge-bases/:id failed', error)
    res.status(200).json(fail(50044, error instanceof Error ? error.message : String(error)))
  }
})

knowledgeBasesRouter.get('/knowledge-bases/:id/documents', async (req, res) => {
  try {
    const list = await listKnowledgeDocuments(paramString(req.params.id))
    res.status(200).json(ok({ list }))
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(200).json(fail(40443, error.message))
      return
    }
    console.error('[api] GET /knowledge-bases/:id/documents failed', error)
    res.status(200).json(fail(50045, error instanceof Error ? error.message : String(error)))
  }
})

knowledgeBasesRouter.post(
  '/knowledge-bases/:id/documents',
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        res.status(200).json(fail(40042, 'file is required'))
        return
      }
      const document = await uploadKnowledgeDocument(paramString(req.params.id), {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        buffer: req.file.buffer
      })
      res.status(200).json(ok({ document }))
    } catch (error) {
      if (error instanceof BadRequestError) {
        res.status(200).json(fail(40043, error.message))
        return
      }
      if (error instanceof NotFoundError) {
        res.status(200).json(fail(40444, error.message))
        return
      }
      console.error('[api] POST /knowledge-bases/:id/documents failed', error)
      res.status(200).json(fail(50046, error instanceof Error ? error.message : String(error)))
    }
  }
)

knowledgeBasesRouter.delete('/knowledge-bases/:kbId/documents/:docId', async (req, res) => {
  try {
    await softDeleteKnowledgeDocument(paramString(req.params.kbId), paramString(req.params.docId))
    res.status(200).json(ok({ ok: true }))
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(200).json(fail(40445, error.message))
      return
    }
    console.error('[api] DELETE /knowledge-bases/:kbId/documents/:docId failed', error)
    res.status(200).json(fail(50047, error instanceof Error ? error.message : String(error)))
  }
})
