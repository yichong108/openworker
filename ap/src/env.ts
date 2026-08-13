/**
 * 解析仓库根目录，并加载 CURSOR_API_KEY 相关环境变量。
 */

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { config as loadDotenv } from 'dotenv'

/**
 * 从当前模块文件向上查找含 package.json 的包根（兼容 `src/` 开发与 `dist/` 发布）。
 */
function resolvePackageRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  while (true) {
    if (existsSync(join(dir, 'package.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return join(dirname(fileURLToPath(import.meta.url)), '..')
    dir = parent
  }
}

const packageRoot = resolvePackageRoot()

/**
 * 从起始目录向上查找用户项目根。
 *
 * 优先识别 pnpm workspace 与 git 仓库，这样 `ap` 无论从子目录、npx 还是全局安装启动，
 * 都会把 skill 装到用户项目的 `.agents/`，而不是 npm 包自己的目录。
 *
 * @param startDir - 起始目录，默认 `process.cwd()`
 * @returns 项目根；找不到则返回 startDir
 */
export function findWorkspaceRoot(startDir: string = process.cwd()): string {
  let dir = startDir
  while (true) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    if (existsSync(join(dir, '.git'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return startDir
    dir = parent
  }
}

/**
 * 本 CLI 包所在目录（源码仓库中的 `ap/`，或 npm 安装后的包根）。
 */
export function getPackageRoot(): string {
  return packageRoot
}

/**
 * 加载包内与项目根的 `.env` / `.env.local`（后者覆盖前者文件，但不覆盖已有 process.env）。
 */
export function loadApEnv(): void {
  const workspaceRoot = findWorkspaceRoot()
  const dirs = [packageRoot, workspaceRoot]
  for (const dir of dirs) {
    for (const name of ['.env', '.env.local'] as const) {
      const path = join(dir, name)
      if (existsSync(path)) {
        loadDotenv({ path, override: false })
      }
    }
  }
}

/**
 * 解析本次运行使用的模型 id。
 *
 * @returns CURSOR_MODEL 或默认 composer-2.5
 */
export function resolveModelId(): string {
  return process.env.CURSOR_MODEL?.trim() || 'composer-2.5'
}

/** Cursor SDK 对话模式 */
export type ApConversationMode = 'agent' | 'plan'

/** SDK 对话模式默认值：直接改代码 */
export const DEFAULT_AP_MODE: ApConversationMode = 'agent'

/**
 * 把字符串校验为 SDK 对话模式。
 *
 * @param value - 用户或环境传入的值
 * @returns agent 或 plan
 */
export function parseConversationMode(value: string): ApConversationMode {
  const mode = value.trim()
  if (mode === 'agent' || mode === 'plan') return mode
  throw new Error(`未知 mode: ${value}（可用: agent, plan）`)
}

/**
 * 解析本次运行使用的 SDK 对话模式。
 *
 * @returns AP_MODE 或默认 agent
 */
export function resolveConversationMode(): ApConversationMode {
  const raw = process.env.AP_MODE?.trim()
  if (!raw) return DEFAULT_AP_MODE
  return parseConversationMode(raw)
}

/**
 * 读取显式传入或环境中的 Cursor API Key。
 *
 * SDK 还会回退到 `Cursor.auth.login()` 写入的 `~/.cursor/sdk/auth.json`；
 * 这里只返回调用方应显式传入的 key（若有）。
 *
 * @returns 去除空白后的 key；未设置则为 undefined
 */
export function readApiKeyFromEnv(): string | undefined {
  const key = process.env.CURSOR_API_KEY?.trim()
  return key || undefined
}
