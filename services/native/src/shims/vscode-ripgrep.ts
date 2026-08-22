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

function getModuleDir(): string {
  return path.dirname(fileURLToPath(import.meta.url))
}

/**
 * 解析可用的 ripgrep 可执行文件绝对路径
 *
 * 优先级：`OPENWORKER_RG_PATH` → Electron `resources/bin` → bundle 旁 `dist/bin` → 平台 optional 包。
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

  const bundleBin = path.join(getModuleDir(), 'bin', binName)
  if (existsSync(bundleBin)) return bundleBin

  try {
    const require = createRequire(fileURLToPath(import.meta.url))
    const platformPkg = `@vscode/ripgrep-${process.platform}-${process.env.npm_config_arch || process.arch}`
    return require.resolve(`${platformPkg}/bin/${binName}`)
  } catch (error) {
    throw new Error(
      `Could not resolve ripgrep binary (${binName}). ` +
        `Set OPENWORKER_RG_PATH or ensure dist/bin/${binName} exists (run pnpm native:build). ` +
        `${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/** ripgrep 可执行文件路径（与 `@vscode/ripgrep` 的 `rgPath` 导出对齐） */
export const rgPath = resolveRgPath()
