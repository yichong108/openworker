import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { config as loadDotenv } from 'dotenv'

import { getWorkspaceRoot } from './workspace-root'

let loaded = false

/**
 * 加载仓库根与 ap-cli 的 .env，供 Cursor SDK 读取 CURSOR_API_KEY。
 *
 * 不覆盖已有 process.env。
 */
export function loadCursorEnv(): void {
  if (loaded) return
  loaded = true
  const workspaceRoot = getWorkspaceRoot()
  const dirs = [
    workspaceRoot,
    join(workspaceRoot, 'apps', 'ap-cli'),
    join(workspaceRoot, 'apps', 'ap-web')
  ]
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
 * 解析本次执行使用的模型 id。
 *
 * @returns CURSOR_MODEL 或默认 composer-2.5
 */
export function resolveModelId(): string {
  return process.env.CURSOR_MODEL?.trim() || 'composer-2.5'
}
