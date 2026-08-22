/**
 * 加载项目根 `.env-{channel}` 后执行命令。
 *
 * 用法: node scripts/with-env.mjs <dev|test|prod> <command...>
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { config } from 'dotenv'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const channel = process.argv[2]
const command = process.argv.slice(3)

const validChannels = new Set(['dev', 'test', 'prod'])

if (!channel || !validChannels.has(channel)) {
  console.error('用法: node scripts/with-env.mjs <dev|test|prod> <command...>')
  process.exit(1)
}

if (command.length === 0) {
  console.error('缺少要执行的命令')
  process.exit(1)
}

const envFile = join(repoRoot, `.env-${channel}`)
if (!existsSync(envFile)) {
  console.error(`缺少环境文件: ${envFile}`)
  process.exit(1)
}

config({ path: envFile, override: true })

const child = spawn(command[0], command.slice(1), {
  cwd: process.cwd(),
  env: process.env,
  shell: true,
  stdio: 'inherit'
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 0)
})
