import cors from 'cors'
import express, { type Express } from 'express'
import { healthRouter } from './routes/health.js'

/**
 * 创建并配置 Express 应用实例
 *
 * 注册通用中间件与路由。与 HTTP 监听解耦，便于单测直接注入 app，
 * 无需真正绑定端口。
 *
 * @returns 配置完成的 Express 应用
 */
export function createApp(): Express {
  const app = express()

  app.use(cors())
  app.use(express.json())
  app.use(healthRouter)

  return app
}
