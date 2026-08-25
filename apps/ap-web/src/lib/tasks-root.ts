import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { TaskFsError } from './task-fs-error'

const TASKS_MARKER = join('.agents', 'ap-config', 'work-data', 'tasks')

/**
 * 从当前工作目录向上查找 tasks 根目录。
 *
 * Next 在 apps/ap-web 下启动时 cwd 不是仓库根，需要走到含
 * `.agents/ap-config/work-data/tasks` 的目录。
 *
 * @param startDir - 搜索起点，默认 process.cwd()
 * @returns tasks 目录的绝对路径
 */
export function getTasksRoot(startDir = process.cwd()): string {
  let dir = resolve(startDir)
  while (true) {
    const candidate = join(dir, TASKS_MARKER)
    if (existsSync(candidate)) {
      return candidate
    }
    const parent = dirname(dir)
    if (parent === dir) {
      throw new TaskFsError(
        '未找到 .agents/ap-config/work-data/tasks，请在本仓库内启动 ap-web',
        500
      )
    }
    dir = parent
  }
}
