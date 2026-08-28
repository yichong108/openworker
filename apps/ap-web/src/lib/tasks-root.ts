import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { getApWebAgentsRoot } from '@/ai/agents-root'
import { TaskFsError } from './task-fs-error'

/**
 * 任务 markdown 根目录：敲命令目录下的 `.agents/ap-config/work-data/tasks`。
 *
 * @returns tasks 目录的绝对路径
 */
export function getTasksRoot(): string {
  const tasksRoot = join(getApWebAgentsRoot(), 'ap-config', 'work-data', 'tasks')
  if (!existsSync(tasksRoot)) {
    throw new TaskFsError(
      `未找到 ${tasksRoot}，请在含 .agents/ap-config/work-data/tasks 的目录启动 ap-web`,
      500
    )
  }
  return tasksRoot
}
