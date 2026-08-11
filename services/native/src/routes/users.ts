import { Router, type Router as ExpressRouter } from 'express'

import { fail, ok } from '../http/envelope.js'
import { listUsers } from '../services/user-service.js'

/**
 * 用户管理路由
 *
 * - GET /users — 返回全部用户公开信息列表（暂无鉴权，供后台管理使用）
 *
 * 响应统一为 `{ code, message, data }`。
 */
export const usersRouter: ExpressRouter = Router()

usersRouter.get('/users', async (_req, res) => {
  try {
    const users = await listUsers()
    res.status(200).json(ok({ users }))
  } catch (error) {
    console.error('[native] GET /users failed', error)
    res.status(200).json(fail(50003, error instanceof Error ? error.message : String(error)))
  }
})
