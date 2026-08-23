/**
 * Native 开发入口：启动 tsx watch。
 * 渠道 env 由 `cross-env CHANNEL=...` + `src/config/env.ts` 的 bootstrapChannelEnv 注入。
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const nativeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const tsxCli = path.join(nativeRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
if (!existsSync(tsxCli)) {
  console.error(`缺少 tsx: ${tsxCli}`)
  process.exit(1)
}

const child = spawn(process.execPath, [tsxCli, 'watch', 'src/index.ts'], {
  cwd: nativeRoot,
  env: process.env,
  stdio: 'inherit',
  shell: false
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 0)
})
