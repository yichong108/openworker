/**
 * OpenWorker 跨包路径约定 — 用户数据根、skills / MCP / SQLite、内置 skills 内容探测。
 *
 * 用户数据根：`OPENWORKER_HOME` 显式覆盖，否则按渠道 `OPENWORKER_DATA_DIR_NAME` → `~/${dataDirName}`。
 */

import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { homedir } from 'node:os'

const OPENWORKER_HOME_ENV = 'OPENWORKER_HOME'

/**
 * 解析 OpenWorker 用户数据根绝对路径。
 *
 * @returns 绝对路径
 */
export function getOpenworkerDir(): string {
  const explicit = process.env[OPENWORKER_HOME_ENV]?.trim()
  if (explicit) return explicit

  const dataDirName = process.env.OPENWORKER_DATA_DIR_NAME?.trim()
  if (!dataDirName) {
    throw new Error(
      '未设置 OPENWORKER_DATA_DIR_NAME，请检查渠道环境（load-env / bootstrapChannelEnv）'
    )
  }

  return path.join(homedir(), dataDirName)
}

/**
 * @returns `{OPENWORKER_HOME}/skills` 绝对路径
 */
export function getOpenworkerSkillsDir(): string {
  return path.join(getOpenworkerDir(), 'skills')
}

/**
 * @returns `{OPENWORKER_HOME}/mcp.json` 绝对路径
 */
export function getOpenworkerMcpConfigPath(): string {
  return path.join(getOpenworkerDir(), 'mcp.json')
}

/**
 * @returns `{OPENWORKER_HOME}/native/native.sqlite` 绝对路径
 */
export function getNativeSqlitePath(): string {
  return path.join(getOpenworkerDir(), 'native', 'native.sqlite')
}

export type ResolveBundledSkillsContentDirOptions = {
  /** Electron `process.resourcesPath` */
  resourcesPath?: string
  /** 当前模块 `import.meta.url`（ESM）；CJS bundle 可能不可用 */
  moduleUrl?: string
  /** 进程 cwd，默认 `process.cwd()` */
  cwd?: string
}

/**
 * 解析内置 skills 内容源目录（`packages/skills/content` 或安装包 `resources/skills`）。
 *
 * @returns 存在的目录绝对路径；找不到时为 null
 */
export function resolveBundledSkillsContentDir(
  options: ResolveBundledSkillsContentDirOptions = {}
): string | null {
  const resourcesPath = options.resourcesPath?.trim()
  if (resourcesPath) {
    const packaged = path.join(resourcesPath, 'skills')
    if (existsSync(packaged)) return packaged
  }

  const cwd = options.cwd ?? process.cwd()
  const candidates = [
    path.resolve(cwd, 'packages/skills/content'),
    path.resolve(cwd, '../../packages/skills/content'),
    path.resolve(cwd, '../packages/skills/content')
  ]

  const moduleUrl = options.moduleUrl?.trim()
  if (moduleUrl) {
    try {
      const here = path.dirname(fileURLToPath(moduleUrl))
      candidates.push(path.resolve(here, '../../../../packages/skills/content'))
    } catch {
      // ignore invalid moduleUrl
    }
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return null
}
