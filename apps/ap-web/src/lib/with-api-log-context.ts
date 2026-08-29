import { randomUUID } from 'node:crypto'

import { runWithLogContextAsync } from '@openworker/log'

import { apWebLog } from './logger'

/**
 * 为 API route handler 注入 requestId，并在结束时打 access 日志。
 */
export async function withApiLogContext<T extends Response>(
  request: Request,
  handler: () => Promise<T>
): Promise<T> {
  const requestId = request.headers.get('x-request-id')?.trim() || randomUUID().slice(0, 8)
  const startedAt = Date.now()
  const url = new URL(request.url)
  const path = `${url.pathname}${url.search}`

  return runWithLogContextAsync({ requestId }, async () => {
    try {
      const response = await handler()
      apWebLog.info(
        {
          requestId,
          method: request.method,
          path,
          status: response.status,
          durationMs: Date.now() - startedAt
        },
        'ap-web:access'
      )
      return response
    } catch (error) {
      apWebLog.info(
        {
          requestId,
          method: request.method,
          path,
          status: 500,
          durationMs: Date.now() - startedAt
        },
        'ap-web:access'
      )
      throw error
    }
  })
}
