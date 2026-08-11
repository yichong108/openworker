import cors from 'cors'
import express, { type Express } from 'express'
import { agentRouter } from './routes/agent.js'
import { authRouter } from './routes/auth.js'
import { healthRouter } from './routes/health.js'
import { mcpRouter } from './routes/mcp.js'
import { sessionsRouter } from './routes/sessions.js'
import { settingsRouter } from './routes/settings.js'
import { skillsRouter } from './routes/skills.js'
import { terminalRouter } from './routes/terminal.js'
import { usersRouter } from './routes/users.js'
import { userProfileRouter } from './routes/user-profile.js'
import { workspacesRouter } from './routes/workspaces.js'

/**
 * 创建并配置 Express 应用实例
 *
 * 注册通用中间件、数据面路由与 Agent/SSE 运行时路由。
 * 与 HTTP 监听解耦，便于单测直接注入 app，无需真正绑定端口。
 *
 * @returns 配置完成的 Express 应用
 */
export function createApp(): Express {
  const app = express()

  app.use(cors())
  // Message[] 整包可能较大
  app.use(express.json({ limit: '32mb' }))
  app.use(healthRouter)
  app.use(authRouter)
  app.use(usersRouter)
  app.use(settingsRouter)
  app.use(workspacesRouter)
  app.use(sessionsRouter)
  app.use(userProfileRouter)
  app.use(agentRouter)
  app.use(skillsRouter)
  app.use(mcpRouter)
  app.use(terminalRouter)

  return app
}
