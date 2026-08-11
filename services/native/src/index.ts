import type { Server } from 'node:http'

import { disposeMcpHostAgent } from './agent/agent-instance.js'
import { startMcpWarmup } from './agent/mcp-warmup.js'
import { ensureUserSkillsLayout } from './agent/skills.js'
import { createApp } from './app.js'
import { env } from './config/env.js'
import { closeDb, ensureSchema } from './db/sqlite.js'
import { getAppSettings } from './services/settings-service.js'

/**
 * 启动 Native HTTP 服务
 *
 * 先确保 SQLite schema 就绪，再仅绑定本机回环地址，便于 Desktop 等本地宿主拉起与探活。
 * 注册 SIGTERM/SIGINT 以关闭 HTTP、MCP 宿主与 SQLite；listen 失败（如端口占用）以非零退出码结束。
 */
function main() {
  ensureSchema()
  console.log(`[native] sqlite ready: ${env.sqlitePath}`)

  // 同步 mcp.json 种子 + 复制内置 skills；MCP 预热异步不阻塞 listen
  void getAppSettings()
    .then(() => ensureUserSkillsLayout())
    .then(() => startMcpWarmup())
    .catch((error) => {
      console.warn(
        '[native] startup skills/mcp init failed',
        error instanceof Error ? error.message : error
      )
    })

  const app = createApp()
  const server: Server = app.listen(env.port, '127.0.0.1', () => {
    console.log(`[native] listening on http://127.0.0.1:${env.port}`)
    console.log('[native] health check: GET /health')
  })

  server.on('error', (error) => {
    console.error('[native] listen failed', error)
    closeDb()
    process.exit(1)
  })

  let shuttingDown = false

  /**
   * 优雅关闭：停止接收连接后关闭 MCP 与 SQLite，再退出进程。
   *
   * @param signal - 触发关闭的信号名，仅用于日志
   */
  const shutdown = (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`[native] received ${signal}, shutting down`)
    server.close((closeError) => {
      if (closeError) {
        console.error('[native] server close error', closeError)
      }
      void disposeMcpHostAgent()
        .catch(() => undefined)
        .finally(() => {
          closeDb()
          process.exit(closeError ? 1 : 0)
        })
    })
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

try {
  main()
} catch (error) {
  console.error('[native] failed to start', error)
  process.exit(1)
}
