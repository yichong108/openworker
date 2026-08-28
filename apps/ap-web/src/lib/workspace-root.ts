import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { getApWebLaunchDir } from '@/ai/agents-root'
import { TaskFsError } from './task-fs-error'

/**
 * 判断目录是否为 ap 工作区根：pnpm workspace，或已初始化的 .agents。
 *
 * @param dir - 待检测目录
 * @returns 是否可作为工作区根
 */
function isWorkspaceRoot(dir: string): boolean {
  return (
    existsSync(join(dir, 'pnpm-workspace.yaml')) ||
    existsSync(join(dir, '.agents', 'ap-config')) ||
    existsSync(join(dir, '.agents', 'skills'))
  )
}

/**
 * 从启动目录向上查找仓库根（含 pnpm-workspace、`.agents/ap-config` 或 `.agents/skills`）。
 *
 * 默认从 `INIT_CWD`（用户敲命令时的目录）开始，这样 `ap view` 能找到用户项目，
 * 而不是 npx/standalone 包自己的目录。
 *
 * @param startDir - 搜索起点，默认 INIT_CWD 或 process.cwd()
 * @returns 仓库根绝对路径
 */
export function getWorkspaceRoot(startDir = getApWebLaunchDir()): string {
  let dir = resolve(startDir)
  while (true) {
    if (isWorkspaceRoot(dir)) return dir
    const parent = dirname(dir)
    if (parent === dir) {
      throw new TaskFsError('未找到仓库根目录，请在本仓库内启动 ap-web', 500)
    }
    dir = parent
  }
}
