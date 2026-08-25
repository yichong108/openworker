import type { NextFunction, Request, Response } from 'express'
import { randomUUID } from 'node:crypto'

import { runWithLogContext } from '@openworker/log'

import { nativeLog } from '../logger.js'

/**
 * 为每个 HTTP 请求注入 requestId / sessionId，并在结束时打 access 日志。
 */
export function logContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = randomUUID().slice(0, 8)
  const sessionId = typeof req.params.id === 'string' ? req.params.id : undefined
  const startedAt = Date.now()

  runWithLogContext({ requestId, sessionId }, () => {
    res.on('finish', () => {
      nativeLog.info(
        {
          requestId,
          sessionId,
          method: req.method,
          path: req.originalUrl || req.url,
          status: res.statusCode,
          durationMs: Date.now() - startedAt
        },
        'native:access'
      )
    })
    next()
  })
}
