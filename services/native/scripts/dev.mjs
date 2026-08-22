/**
 * Native 开发入口：确保根目录 `.env-dev` 已加载后启动 tsx watch。
 *
 * 从 monorepo 根 `pnpm dev` 启动时，父进程已由 with-env 注入 env，此处跳过。
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { config } from 'dotenv'

function findRepoRoot(startDir) {
  let dir = startDir
  while (true) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir
    if (existsSync(path.join(dir, '.git'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return startDir
    dir = parent
  }
}

const nativeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

if (!process.env.APP_CHANNEL?.trim()) {
  const envFile = path.join(findRepoRoot(nativeRoot), '.env-dev')
  if (!existsSync(envFile)) {
    console.error(`缺少环境文件: ${envFile}`)
    process.exit(1)
  }
  config({ path: envFile, override: true })
}

const tsxCli = path.join(nativeRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
if (!existsSync(tsxCli)) {
  console.error(`缺少 tsx: ${tsxCli}`)
  process.exit(1)
}

const child = spawn(process.execPath, [tsxCli, 'watch', '--debounce', '800', 'src/index.ts'], {
  cwd: nativeRoot,
  env: process.env,
  stdio: 'inherit',
  shell: false
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 0)
})
