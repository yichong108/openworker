#!/usr/bin/env node
/**
 * @openworker/ap-web 入口：启动 standalone Next 服务器。
 * 本地 workspace：`.next/standalone` + 包内依赖；发布包：`standalone-dist` + npm 安装的依赖。
 * PORT 默认 10000；INIT_CWD / AP_WEB_LAUNCH_DIR 由 ap view 注入。
 * 监听地址用 AP_WEB_HOSTNAME，默认 127.0.0.1，不读取系统 HOSTNAME（电脑名）。
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const port = process.env.PORT?.trim() || '10000'
const hostname = process.env.AP_WEB_HOSTNAME?.trim() || '127.0.0.1'

const serverCandidates = [
  join(packageRoot, 'standalone-dist', 'server.js'),
  join(packageRoot, 'standalone-dist', 'apps', 'ap-web', 'server.js'),
  join(packageRoot, '.next', 'standalone', 'server.js'),
  join(packageRoot, '.next', 'standalone', 'apps', 'ap-web', 'server.js')
]
const serverJs = serverCandidates.find((candidate) => existsSync(candidate))
if (!serverJs) {
  console.error('[ap-web] 未找到 standalone server.js，请先运行 pnpm ap-web:build')
  process.exit(1)
}
const serverDir = dirname(serverJs)

const child = spawn(process.execPath, [serverJs], {
  cwd: serverDir,
  env: {
    ...process.env,
    PORT: port,
    HOSTNAME: hostname,
    NODE_PATH: [join(packageRoot, 'node_modules'), process.env.NODE_PATH]
      .filter(Boolean)
      .join(delimiter)
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
