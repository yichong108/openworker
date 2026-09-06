import { Router, type Router as ExpressRouter } from 'express'

import { pingDb } from '../db/prisma.js'

/**
 * 健康检查路由
 *
 * 聚合进程状态与数据库连通性，供本地探活与后续 Desktop 拉起检测使用。
 */
export const healthRouter: ExpressRouter = Router()

healthRouter.get('/health', async (_req, res) => {
  const dbOk = await pingDb()
  const ok = dbOk

  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    checks: {
      database: dbOk ? 'up' : 'down'
    }
  })
})
