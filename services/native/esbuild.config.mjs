/**
 * 将 Native 入口打成单文件 CJS，供 Desktop extraResources 携带。
 *
 * - 使用 CJS + `.cjs` 后缀，避免安装包/仓库内上层 `"type":"module"` 把入口当 ESM。
 * - `@vscode/ripgrep` 走本地 shim，并复制 `rg` 二进制到 `dist/bin/`，避免 bundle 内
 *   `createRequire(import.meta.url)` 被掏空导致进程秒退。
 * - `node:*` 内置模块由 platform:node 自动 external；Express 等依赖打进 bundle。
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import * as esbuild from 'esbuild'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const shimPath = path.resolve(rootDir, 'src/shims/vscode-ripgrep.ts')
const outFile = path.resolve(rootDir, 'dist/desktop-bundle.cjs')
const binOutDir = path.resolve(rootDir, 'dist/bin')

await esbuild.build({
  entryPoints: [path.resolve(rootDir, 'src/index.ts')],
  outfile: outFile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: false,
  logLevel: 'info',
  alias: {
    '@vscode/ripgrep': shimPath
  },
  // CJS 下 esbuild 会把 import.meta 置空；用 __filename 回填，兜底其它引用
  banner: {
    js: 'var __import_meta_url = require("url").pathToFileURL(__filename).href;'
  },
  define: {
    'import.meta.url': '__import_meta_url'
  }
})

/**
 * 解析当前平台 `@vscode/ripgrep` 的 rg 路径并复制到 dist/bin
 *
 * 通过 agent 包目录加载真实 ESM 包（native 未直接依赖该包，但 monorepo 中可解析）。
 */
function copyRipgrepBinary() {
  const agentDir = path.resolve(rootDir, '../../packages/agent')
  const binName = process.platform === 'win32' ? 'rg.exe' : 'rg'
  let rgPath = ''
  try {
    rgPath = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "import { rgPath } from '@vscode/ripgrep'; process.stdout.write(rgPath)"
      ],
      { cwd: agentDir, encoding: 'utf8' }
    ).trim()
  } catch (error) {
    console.warn(
      '[native:bundle] skip rg copy — cannot resolve @vscode/ripgrep from packages/agent'
    )
    console.warn(error instanceof Error ? error.message : error)
    return
  }

  if (!rgPath || !existsSync(rgPath)) {
    console.warn(`[native:bundle] skip rg copy — missing file: ${rgPath || '(empty)'}`)
    return
  }

  mkdirSync(binOutDir, { recursive: true })
  const dest = path.join(binOutDir, binName)
  copyFileSync(rgPath, dest)
  console.log(`[native:bundle] copied ripgrep → ${pathToFileURL(dest).href}`)
}

copyRipgrepBinary()
