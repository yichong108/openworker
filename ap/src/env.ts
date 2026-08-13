/**
 * 解析仓库根目录，并加载 CURSOR_API_KEY 相关环境变量。
 */

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { config as loadDotenv } from 'dotenv'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 从当前目录向上查找含 pnpm-workspace.yaml 的仓库根。
 *
 * 从 `ap/` 子包启动时 cwd 可能不是仓库根，Agent 必须在仓库根上跑才能看到
 * `ap/src/skills` 与 `.agents/ap-config/work-data/tasks`。
 *
 * @param startDir - 起始目录
 * @returns 仓库根；找不到则返回 startDir
 */
export function findWorkspaceRoot(startDir: string): string {
  let dir = startDir
  while (true) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return startDir
    dir = parent
  }
}

/**
 * 本 CLI 包所在目录（仓库根下的 ap/）。
 */
export function getPackageRoot(): string {
  return packageRoot
}

/**
 * 加载包内与仓库根的 `.env` / `.env.local`（后者覆盖前者文件，但不覆盖已有 process.env）。
 */
export function loadApEnv(): void {
  const workspaceRoot = findWorkspaceRoot(packageRoot)
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
