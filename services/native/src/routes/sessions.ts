import { Router, type Router as ExpressRouter } from 'express'
import type { PatchSessionRequest, SessionMessagesPayload } from '@openworker/shared'

import { clearSessionState } from '../agent/agent-service.js'
import { fail, ok, BadRequestError, NotFoundError } from '../http/envelope.js'
import { nativeLog } from '../logger.js'
import {
  getSessionMessages,
  patchSession,
  putSessionMessages,
  softDeleteSession
} from '../services/session-service.js'

/**
 * 会话路由（本机单租户）
 *
 * - PATCH/DELETE /sessions/:id
 * - GET/PUT /sessions/:id/messages
 */
export const sessionsRouter: ExpressRouter = Router()

sessionsRouter.patch('/sessions/:id', async (req, res) => {
  try {
    const body = (req.body ?? {}) as PatchSessionRequest
    const session = await patchSession(req.params.id!, body)
    res.status(200).json(ok({ session }))
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(200).json(fail(40420, error.message))
      return
    }
    if (error instanceof BadRequestError) {
      res.status(200).json(fail(40021, error.message))
      return
    }
    nativeLog.error('PATCH /sessions/:id failed', error)
    res.status(200).json(fail(50022, error instanceof Error ? error.message : String(error)))
  }
})

sessionsRouter.delete('/sessions/:id', async (req, res) => {
  try {
    const sessionId = req.params.id!
    await softDeleteSession(sessionId)
    clearSessionState(sessionId)
    res.status(200).json(ok({ ok: true }))
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(200).json(fail(40420, error.message))
      return
    }
    nativeLog.error('DELETE /sessions/:id failed', error)
    res.status(200).json(fail(50023, error instanceof Error ? error.message : String(error)))
  }
})

sessionsRouter.get('/sessions/:id/messages', async (req, res) => {
  try {
    const data = await getSessionMessages(req.params.id!)
    res.status(200).json(ok(data))
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(200).json(fail(40420, error.message))
      return
    }
    nativeLog.error('GET /sessions/:id/messages failed', error)
    res.status(200).json(fail(50024, error instanceof Error ? error.message : String(error)))
  }
})

sessionsRouter.put('/sessions/:id/messages', async (req, res) => {
  try {
    const body = (req.body ?? {}) as SessionMessagesPayload
    const data = await putSessionMessages(req.params.id!, body)
    res.status(200).json(ok(data))
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(200).json(fail(40420, error.message))
      return
    }
    if (error instanceof BadRequestError) {
      res.status(200).json(fail(40022, error.message))
      return
    }
    nativeLog.error('PUT /sessions/:id/messages failed', error)
    res.status(200).json(fail(50025, error instanceof Error ? error.message : String(error)))
  }
})
