import cors from 'cors'
import express from 'express'
import { authRouter } from './routes/auth.js'
import { healthRouter } from './routes/health.js'
import { knowledgeBasesRouter } from './routes/knowledge-bases.js'
import { ragRouter } from './routes/rag.js'
import { sessionsRouter } from './routes/sessions.js'
import { settingsRouter } from './routes/settings.js'
import { usersRouter } from './routes/users.js'
import { userProfileRouter } from './routes/user-profile.js'
import { workspacesRouter } from './routes/workspaces.js'

/**
 * 创建并配置 Express 应用实例
 *
 * 注册通用中间件与路由。与 HTTP 监听解耦，便于单测直接注入 app，
 * 无需真正绑定端口。
 *
 * @returns 配置完成的 Express 应用
 */
export function createApp() {
  const app = express()

  app.use(cors())
  // Message[] 整包可能较大
  app.use(express.json({ limit: '32mb' }))
  app.use(healthRouter)
  app.use(authRouter)
  app.use(usersRouter)
  app.use(settingsRouter)
  // 管理端开放接口须挂在带 requireAuth 的 Router 之前：
  // workspaces/sessions/profile 的 router.use(requireAuth) 会对进入该 Router 的全部请求鉴权
  app.use(knowledgeBasesRouter)
  app.use(ragRouter)
  app.use(workspacesRouter)
  app.use(sessionsRouter)
  app.use(userProfileRouter)

  return app
}
