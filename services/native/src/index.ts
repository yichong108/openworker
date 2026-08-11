import { createApp } from './app.js'
import { env } from './config/env.js'
import { ensureSchema } from './db/sqlite.js'

/**
 * 启动 Native HTTP 服务
 *
 * 先确保 SQLite schema 就绪，再绑定配置端口并输出启动日志。
 * 启动失败时以非零退出码结束进程，方便进程管理器识别并重启。
 */
function main() {
  ensureSchema()
  console.log(`[native] sqlite ready: ${env.sqlitePath}`)

  const app = createApp()

  app.listen(env.port, () => {
    console.log(`[native] listening on http://127.0.0.1:${env.port}`)
    console.log('[native] health check: GET /health')
  })
}

try {
  main()
} catch (error) {
  console.error('[native] failed to start', error)
  process.exit(1)
}
