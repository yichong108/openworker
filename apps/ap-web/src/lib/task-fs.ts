import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'

import { TaskFsError } from './task-fs-error'
import {
  buildTaskMarkdown,
  formatLocalTimestamp,
  replaceTaskStatus,
  serializeTaskMarkdown,
  toTaskDetail,
  toTaskSummary
} from './task-parse'
import type {
  CreateTaskInput,
  TaskBoardPayload,
  TaskColumn,
  TaskDetail,
  TaskSummary,
  UpdateTaskInput
} from './task-types'
import { TASK_COLUMNS } from './task-types'
import { getTasksRoot } from './tasks-root'
import { resolveTaskTitle } from './task-title'

export { TaskFsError } from './task-fs-error'

const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 }

/**
 * 把绝对路径转成 tasks 根下的 POSIX 相对路径，作为任务 id。
 *
 * @param tasksRoot - tasks 根目录
 * @param absPath - 文件绝对路径
 * @returns 如 todo/task-xxx.md
 */
function toPosixId(tasksRoot: string, absPath: string): string {
  return relative(tasksRoot, absPath).split(sep).join('/')
}

/**
 * 从 id 取出所在列（第一段目录名）。
 *
 * @param id - 任务 id
 * @returns 列名
 */
function columnFromId(id: string): TaskColumn {
  const top = id.split('/')[0]
  if (!TASK_COLUMNS.includes(top as TaskColumn)) {
    throw new TaskFsError('非法任务目录', 400)
  }
  return top as TaskColumn
}

/**
 * 校验 id 并解析为 tasks 根下的绝对路径，禁止穿越与访问 plan/。
 *
 * @param id - 相对路径 id
 * @returns 绝对路径
 */
function resolveSafeTaskFile(id: string): string {
  const trimmed = id.trim()
  if (!trimmed || trimmed.includes('\0')) {
    throw new TaskFsError('非法任务 id', 400)
  }
  const parts = trimmed.split('/').filter((part) => part.length > 0)
  if (parts.some((part) => part === '.' || part === '..' || part.includes('\\'))) {
    throw new TaskFsError('非法任务 id', 400)
  }

  const tasksRoot = getTasksRoot()
  const abs = resolve(tasksRoot, ...parts)
  const rel = relative(tasksRoot, abs)
  if (rel.startsWith('..') || isAbsolute(rel) || rel === '') {
    throw new TaskFsError('路径越界', 400)
  }

  const top = rel.split(/[/\\]/)[0]
  if (top === 'plan') {
    throw new TaskFsError('不得访问 plan/', 400)
  }
  if (!TASK_COLUMNS.includes(top as TaskColumn)) {
    throw new TaskFsError('非法任务目录', 400)
  }
  return abs
}

/**
 * 收集目录下的 markdown 任务文件。
 *
 * 忽略模板与非 md；done 列递归年份子目录。
 *
 * @param dir - 列目录
 * @param recursive - 是否递归
 * @returns 绝对路径列表
 */
function collectMarkdownFiles(dir: string, recursive: boolean): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (recursive) out.push(...collectMarkdownFiles(full, true))
      continue
    }
    if (!entry.isFile()) continue
    if (entry.name === 'task-template.md') continue
    if (!entry.name.toLowerCase().endsWith('.md')) continue
    out.push(full)
  }
  return out
}

/**
 * 同列内按优先级再按文件名排序，编号小的在前。
 *
 * @param tasks - 待排序列表
 * @returns 新数组
 */
function sortTasks(tasks: TaskSummary[]): TaskSummary[] {
  return [...tasks].sort((a, b) => {
    const rank = (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2)
    if (rank !== 0) return rank
    return a.fileName.localeCompare(b.fileName)
  })
}

/**
 * 列出某一列的任务摘要。
 *
 * @param column - 列名
 * @returns 排序后的卡片列表
 */
function listColumn(column: TaskColumn): TaskSummary[] {
  const tasksRoot = getTasksRoot()
  const dir = join(tasksRoot, column)
  const files = collectMarkdownFiles(dir, column === 'done')
  const tasks = files.map((abs) => {
    const markdown = readFileSync(abs, 'utf8')
    return toTaskSummary(toPosixId(tasksRoot, abs), basename(abs), column, markdown)
  })
  return sortTasks(tasks)
}

/**
 * 读取四列看板数据（不含 plan）。
 *
 * @returns 四列任务摘要
 */
export function listBoard(): TaskBoardPayload {
  return {
    todo: listColumn('todo'),
    doing: listColumn('doing'),
    done: listColumn('done'),
    blocked: listColumn('blocked')
  }
}

/**
 * 读取单个任务详情。
 *
 * @param id - 任务 id
 * @returns 详情
 */
export function readTask(id: string): TaskDetail {
  const abs = resolveSafeTaskFile(id)
  if (!existsSync(abs)) {
    throw new TaskFsError('任务不存在', 404)
  }
  const markdown = readFileSync(abs, 'utf8')
  return toTaskDetail(id, basename(abs), columnFromId(id), markdown)
}

/**
 * 目标列的写入目录；done 归档到当年年份子目录。
 *
 * @param column - 目标列
 * @returns 绝对目录
 */
function destinationDir(column: TaskColumn): string {
  const tasksRoot = getTasksRoot()
  if (column === 'done') {
    return join(tasksRoot, 'done', String(new Date().getFullYear()))
  }
  return join(tasksRoot, column)
}

/**
 * 在 todo/ 创建任务文件，文件名为 task-YYYYMMDDHHmmSS.md。
 *
 * @param input - 名称、想法等字段
 * @returns 新任务详情
 */
export async function createTask(input: CreateTaskInput): Promise<TaskDetail> {
  const requirements = input.requirements?.trim() ?? ''
  if (!requirements) {
    throw new TaskFsError('想法不能为空', 400)
  }
  const title = await resolveTaskTitle(input.title, requirements)

  const tasksRoot = getTasksRoot()
  const destDir = join(tasksRoot, 'todo')
  mkdirSync(destDir, { recursive: true })

  let fileName = `task-${formatLocalTimestamp()}.md`
  let dest = join(destDir, fileName)
  if (existsSync(dest)) {
    fileName = `task-${formatLocalTimestamp(new Date(Date.now() + 1000))}.md`
    dest = join(destDir, fileName)
  }
  if (existsSync(dest)) {
    throw new TaskFsError('文件已存在，请重试', 409)
  }

  const markdown = buildTaskMarkdown({ ...input, title, requirements })
  writeFileSync(dest, markdown, 'utf8')
  return readTask(toPosixId(tasksRoot, dest))
}

/**
 * 就地更新任务正文：标题、优先级与想法（Requirements）。
 *
 * 不改目录、Status、依赖、Context、Constraints 与 Agent Notes。想法不能为空。
 *
 * @param id - 当前 id
 * @param input - 要覆盖的字段
 * @returns 更新后的详情
 */
export function updateTask(id: string, input: UpdateTaskInput): TaskDetail {
  const current = readTask(id)
  const title = input.title !== undefined ? input.title.trim() || current.title : current.title
  const requirements =
    input.requirements !== undefined ? input.requirements.trim() : current.requirements
  if (!requirements) {
    throw new TaskFsError('想法不能为空', 400)
  }

  const markdown = serializeTaskMarkdown({
    title,
    status: current.status,
    priority: input.priority ?? current.priority,
    dependencies: current.dependencies,
    context: current.context,
    requirements,
    constraints: current.constraints,
    agentNotes: current.agentNotes
  })
  writeFileSync(resolveSafeTaskFile(id), markdown, 'utf8')
  return readTask(id)
}

/**
 * 改状态：更新 markdown 中的 Status，并移动到对应目录（保留文件名）。
 *
 * 移入 done 时写入 `done/{year}/`。禁止写入 plan/。
 *
 * @param id - 当前 id
 * @param column - 目标列
 * @returns 移动后的详情（id 可能变化）
 */
export function moveTask(id: string, column: TaskColumn): TaskDetail {
  const src = resolveSafeTaskFile(id)
  if (!existsSync(src)) {
    throw new TaskFsError('任务不存在', 404)
  }

  if (columnFromId(id) === column) {
    return readTask(id)
  }

  const destDir = destinationDir(column)
  mkdirSync(destDir, { recursive: true })
  const dest = join(destDir, basename(src))
  if (existsSync(dest)) {
    throw new TaskFsError(`目标已存在: ${basename(src)}`, 409)
  }

  const markdown = replaceTaskStatus(readFileSync(src, 'utf8'), column)
  writeFileSync(dest, markdown, 'utf8')
  unlinkSync(src)

  return readTask(toPosixId(getTasksRoot(), dest))
}
