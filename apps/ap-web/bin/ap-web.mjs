#!/usr/bin/env node
/**
 * @openworker/ap-web 发布包入口：启动 standalone Next 服务器。
 * PORT 默认 10000；INIT_CWD 由 ap view 注入。
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const port = process.env.PORT?.trim() || '10000'
const hostname = process.env.HOSTNAME?.trim() || '127.0.0.1'

const serverCandidates = [
  join(packageRoot, 'standalone-dist', 'server.js'),
  join(packageRoot, 'standalone-dist', 'apps', 'ap-web', 'server.js'),
  join(packageRoot, '.publish-staging', 'standalone-dist', 'server.js'),
  join(packageRoot, '.publish-staging', 'standalone-dist', 'apps', 'ap-web', 'server.js')
]
const serverJs = serverCandidates.find((candidate) => existsSync(candidate))
if (!serverJs) {
  console.error('[ap-web] 未找到 standalone server.js，请先 build 并 prepare-standalone')
  process.exit(1)
}
const serverDir = dirname(serverJs)

const child = spawn(process.execPath, [serverJs], {
  cwd: serverDir,
  env: {
    ...process.env,
    PORT: port,
    HOSTNAME: hostname
  },
  stdio: 'inherit'
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.exit(1)
    return
  }
  process.exit(code ?? 0)
})
