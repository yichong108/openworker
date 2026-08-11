import { Router, type Router as ExpressRouter } from 'express'
import type { LoginRequest } from '@openworker/shared'

import { fail, ok } from '../http/envelope.js'
import {
  getUserFromAccessToken,
  InvalidCredentialsError,
  loginWithPassword
} from '../services/auth-service.js'

/**
 * 认证路由
 *
 * - POST /auth/login — 账号密码登录，返回 JWT 与用户信息
 * - GET  /auth/me    — 用 Bearer token 查询当前用户（可选，便于会话恢复）
 *
 * 当前不提供注册接口。响应统一为 `{ code, message, data }`。
 */
export const authRouter: ExpressRouter = Router()

authRouter.post('/auth/login', async (req, res) => {
  try {
    const body = (req.body ?? {}) as Partial<LoginRequest>
    const username = typeof body.username === 'string' ? body.username : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!username.trim() || !password) {
      res.status(200).json(fail(40001, 'username and password are required'))
      return
    }

    const data = await loginWithPassword(username, password)
    res.status(200).json(ok(data))
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      res.status(200).json(fail(40101, error.message))
      return
    }
    console.error('[native] POST /auth/login failed', error)
    res.status(200).json(fail(50001, error instanceof Error ? error.message : String(error)))
  }
})

authRouter.get('/auth/me', async (req, res) => {
  try {
    const header = req.headers.authorization
    if (!header || !header.startsWith('Bearer ')) {
      res.status(200).json(fail(40102, 'Missing or invalid Authorization header'))
      return
    }

    const token = header.slice('Bearer '.length).trim()
    if (!token) {
      res.status(200).json(fail(40102, 'Missing access token'))
      return
    }

    const user = await getUserFromAccessToken(token)
    if (!user) {
      res.status(200).json(fail(40102, 'Invalid or expired token'))
      return
    }

    res.status(200).json(ok({ user }))
  } catch (error) {
    console.error('[native] GET /auth/me failed', error)
    res.status(200).json(fail(50002, error instanceof Error ? error.message : String(error)))
  }
})
