import { Router } from 'express'
import { pingSqlite } from '../db/sqlite.js'

/**
 * 健康检查路由
 *
 * 聚合进程状态与 SQLite 连通性，供本地探活与后续 Desktop 拉起检测使用。
 */
export const healthRouter = Router()

healthRouter.get('/health', (_req, res) => {
  const sqliteOk = pingSqlite()
  const ok = sqliteOk

  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    checks: {
      sqlite: sqliteOk ? 'up' : 'down'
    }
  })
})
