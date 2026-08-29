import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { config as loadDotenv } from 'dotenv'

import { getWorkspaceRoot } from '@/lib/workspace-root'

let loaded = false

/**
 * 加载仓库根、ap-cli、ap-web 的 .env（如 DEEPSEEK_API_KEY、TAVILY_API_KEY）。
 *
 * 不覆盖已有 process.env。
 */
export function loadApEnv(): void {
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
