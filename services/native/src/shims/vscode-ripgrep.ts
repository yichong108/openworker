/**
 * `@vscode/ripgrep` 替身 — 供 desktop-bundle（CJS）使用
 *
 * 原包装在 CJS bundle 中会因 `createRequire(import.meta.url)` 被 esbuild 掏空而崩溃；
 * 安装包内改为读取 `resources/bin/rg(.exe)`（由 esbuild 构建时复制）。
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const binName = process.platform === 'win32' ? 'rg.exe' : 'rg'

/**
 * 解析可用的 ripgrep 可执行文件绝对路径
 *
 * 优先级：`OPENWORKER_RG_PATH` → Electron `resources/bin` → 开发态真实 `@vscode/ripgrep`。
 *
 * @returns rg 可执行文件绝对路径
 * @throws {Error} 当所有候选均不存在时抛出
 */
function resolveRgPath(): string {
  const fromEnv = process.env.OPENWORKER_RG_PATH?.trim()
  if (fromEnv && existsSync(fromEnv)) return fromEnv

  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (typeof resourcesPath === 'string' && resourcesPath.trim()) {
    const packaged = path.join(resourcesPath, 'bin', binName)
    if (existsSync(packaged)) return packaged
  }

  // 开发 / 非打包：回退到真实包（ESM，import.meta.url 可用）
  try {
    const require = createRequire(fileURLToPath(import.meta.url))
    const pkgJson = require.resolve('@vscode/ripgrep/package.json')
    const requireFromPkg = createRequire(pkgJson)
    // 动态加载平台包路径：与上游 lib/index.js 一致
    const platformPkg = `@vscode/ripgrep-${process.platform}-${process.env.npm_config_arch || process.arch}`
    return requireFromPkg.resolve(`${platformPkg}/bin/${binName}`)
  } catch (error) {
    throw new Error(
      `Could not resolve ripgrep binary (${binName}). ` +
        `Set OPENWORKER_RG_PATH or ensure resources/bin/${binName} is packaged. ` +
        `${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/** ripgrep 可执行文件路径（与 `@vscode/ripgrep` 的 `rgPath` 导出对齐） */
export const rgPath = resolveRgPath()
