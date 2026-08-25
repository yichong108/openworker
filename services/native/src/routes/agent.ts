/**
 * Agent 运行时路由：SSE run + cancel
 */

import { Router, type Router as ExpressRouter } from 'express'
import { EventType, type RunErrorEvent } from '@ag-ui/client'
import type { AgentSendOptions } from '@openworker/shared'

import { cancelRun, isSessionRunning, runUserMessage } from '../agent/agent-service.js'
import { subscribeSessionStream } from '../agent/agent-stream.js'
import { endSse, initSseResponse, writeSsePayload } from '../agent/sse.js'
import { autoNameSessionFromFirstMessage } from '../agent/session-auto-name.js'
import { fail, ok, NotFoundError } from '../http/envelope.js'
import { nativeLog } from '../logger.js'
import { getSession } from '../services/session-service.js'

/**
 * Agent 路由（本机单租户）
 *
 * - POST /sessions/:id/agent/run — SSE 推送 AG-UI 事件
 * - POST /sessions/:id/agent/cancel — 取消当前 run
 */
export const agentRouter: ExpressRouter = Router()

agentRouter.post('/sessions/:id/agent/run', async (req, res) => {
  const sessionId = req.params.id!
  const body = (req.body ?? {}) as AgentSendOptions & { text?: string }
  const text = typeof body.text === 'string' ? body.text : ''

  try {
    await getSession(sessionId)
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(200).json(fail(40420, error.message))
      return
    }
    nativeLog.error('POST /sessions/:id/agent/run precheck failed', error)
    res.status(200).json(fail(50030, error instanceof Error ? error.message : String(error)))
    return
  }

  initSseResponse(res)

  const unsub = subscribeSessionStream(sessionId, (payload) => {
    writeSsePayload(res, payload)
  })

  let clientClosed = false
  req.on('close', () => {
    clientClosed = true
    if (isSessionRunning(sessionId)) {
      cancelRun(sessionId)
    }
  })

  // 首条消息自动命名（与历史 Desktop 行为一致：与 run 并行）
  void autoNameSessionFromFirstMessage(sessionId, text)

  try {
    await runUserMessage(sessionId, text, {
      mode: body.mode,
      workspacePath: body.workspacePath,
      editUserOrdinal: body.editUserOrdinal
    })
  } catch (error) {
    nativeLog.error('agent run failed', error)
    if (!res.writableEnded) {
      const err: RunErrorEvent = {
        type: EventType.RUN_ERROR,
        message: error instanceof Error ? error.message : String(error),
        code: 'ERROR',
        timestamp: Date.now()
      }
      writeSsePayload(res, { sessionId, event: err })
    }
  } finally {
    unsub()
    if (!clientClosed) {
      endSse(res)
    } else if (!res.writableEnded) {
      res.end()
    }
  }
})

agentRouter.post('/sessions/:id/agent/cancel', async (req, res) => {
  try {
    const sessionId = req.params.id!
    await getSession(sessionId)
    cancelRun(sessionId)
    res.status(200).json(ok({ ok: true }))
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(200).json(fail(40420, error.message))
      return
    }
    nativeLog.error('POST /sessions/:id/agent/cancel failed', error)
    res.status(200).json(fail(50031, error instanceof Error ? error.message : String(error)))
  }
})
