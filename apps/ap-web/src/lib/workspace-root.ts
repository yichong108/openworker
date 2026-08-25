import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { TaskFsError } from './task-fs-error'

/**
 * 从当前工作目录向上查找仓库根（含 pnpm-workspace 或 .agents/skills）。
 *
 * @param startDir - 搜索起点，默认 process.cwd()
 * @returns 仓库根绝对路径
 */
export function getWorkspaceRoot(startDir = process.cwd()): string {
  let dir = resolve(startDir)
  while (true) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    if (existsSync(join(dir, '.agents', 'skills'))) return dir
    const parent = dirname(dir)
    if (parent === dir) {
      throw new TaskFsError('未找到仓库根目录，请在本仓库内启动 ap-web', 500)
    }
    dir = parent
  }
}
