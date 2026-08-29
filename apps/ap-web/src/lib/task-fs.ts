import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  statSync,
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
import { generateTaskTitle, titleFromIdeaFallback } from '@/ai/task-title'

export { TaskFsError } from './task-fs-error'

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
 * 忽略模板、隐藏文件、子目录与非 md。
 *
 * @param dir - 列目录
 * @returns 绝对路径列表
 */
function collectMarkdownFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    if (!entry.isFile()) continue
    if (entry.name === 'task-template.md') continue
    if (!entry.name.toLowerCase().endsWith('.md')) continue
    out.push(join(dir, entry.name))
  }
  return out
}

/**
 * 同列内按更新时间从近到远排序；时间相同则按文件名。
 *
 * @param tasks - 待排序列表
 * @returns 新数组
 */
function sortTasks(tasks: TaskSummary[]): TaskSummary[] {
  return [...tasks].sort((a, b) => {
    const byTime = b.updatedAt.localeCompare(a.updatedAt)
    if (byTime !== 0) return byTime
    return a.fileName.localeCompare(b.fileName)
  })
}

/**
 * 读取任务 markdown 文件的 mtime。
 *
 * @param abs - 文件绝对路径
 * @returns ISO 8601 时间
 */
function fileUpdatedAt(abs: string): string {
  return statSync(abs).mtime.toISOString()
}

/**
 * 把已写入的文件刷到磁盘，并读回确认当前进程能打开。
 *
 * @param abs - 文件绝对路径
 */
function flushAndAssertReadable(abs: string): void {
  const fd = openSync(abs, 'r+')
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  if (!existsSync(abs)) {
    throw new TaskFsError('任务文件尚未落盘', 500)
  }
  readFileSync(abs, 'utf8')
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
  const files = collectMarkdownFiles(dir)
  const tasks = files.map((abs) => {
    const markdown = readFileSync(abs, 'utf8')
    return toTaskSummary(
      toPosixId(tasksRoot, abs),
      basename(abs),
      column,
      markdown,
      fileUpdatedAt(abs)
    )
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
  return toTaskDetail(id, basename(abs), columnFromId(id), markdown, fileUpdatedAt(abs))
}

/**
 * 目标列的写入目录。
 *
 * @param column - 目标列
 * @returns 绝对目录
 */
function destinationDir(column: TaskColumn): string {
  return join(getTasksRoot(), column)
}

/**
 * 在指定列目录创建任务文件，文件名为 task-YYYYMMDDHHmmSS.md。
 *
 * 未填名称时先用备注首行落盘并立即返回，再后台用 AI 起名写回
 * （用户已改名或改过备注则不覆盖）。看板经文件监听刷新。
 *
 * @param input - 名称、备注、初始列等字段
 * @returns 新任务详情
 */
export function createTask(input: CreateTaskInput): TaskDetail {
  const humanNotes = input.humanNotes?.trim() ?? ''
  if (!humanNotes) {
    throw new TaskFsError('备注不能为空', 400)
  }
  const given = input.title?.trim() ?? ''
  const title = given || titleFromIdeaFallback(humanNotes)
  const column: TaskColumn = input.status ?? 'todo'

  const tasksRoot = getTasksRoot()
  const destDir = destinationDir(column)
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

  const markdown = buildTaskMarkdown({
    ...input,
    title,
    humanNotes,
    status: column
  })
  writeFileSync(dest, markdown, 'utf8')
  const detail = readTask(toPosixId(tasksRoot, dest))
  if (!given) {
    scheduleGeneratedTitle(detail.id, title, humanNotes)
  }
  return detail
}

/**
 * 按创建时的 id 定位当前任务：文件还在原路径则用之，否则按文件名在四列中查找
 * （创建后可能被移到其他列）。
 *
 * @param id - 创建时的任务 id
 * @returns 当前 id；已删除则为 null
 */
function locateTaskId(id: string): string | null {
  try {
    if (existsSync(resolveSafeTaskFile(id))) return id
  } catch {
    /* 可能已移动或删除 */
  }
  const fileName = basename(id)
  if (!fileName) return null
  const board = listBoard()
  for (const column of TASK_COLUMNS) {
    const hit = board[column].find((task) => task.fileName === fileName)
    if (hit) return hit.id
  }
  return null
}

/**
 * 后台用 AI 起名并写回；失败或用户已改标题/备注则保留落盘时的首行标题。
 *
 * @param id - 创建时的任务 id
 * @param placeholder - 落盘时写入的首行标题
 * @param idea - 创建时的备注正文
 */
function scheduleGeneratedTitle(id: string, placeholder: string, idea: string): void {
  setTimeout(() => {
    void (async () => {
      try {
        const generated = await generateTaskTitle(idea)
        if (!generated || generated === placeholder) return
        const currentId = locateTaskId(id)
        if (!currentId) return
        const current = readTask(currentId)
        if (current.title !== placeholder) return
        if (current.humanNotes.trim() !== idea.trim()) return
        updateTask(currentId, { title: generated })
      } catch {
        /* 起名失败保留首行标题 */
      }
    })()
  }, 0)
}

/**
 * 就地更新任务正文：标题、优先级与 Human Notes。
 *
 * 不改目录、Status 与 Agent Notes。备注不能为空。
 *
 * @param id - 当前 id
 * @param input - 要覆盖的字段
 * @returns 更新后的详情
 */
export function updateTask(id: string, input: UpdateTaskInput): TaskDetail {
  const current = readTask(id)
  const title = input.title !== undefined ? input.title.trim() || current.title : current.title
  const humanNotes = input.humanNotes !== undefined ? input.humanNotes.trim() : current.humanNotes
  if (!humanNotes) {
    throw new TaskFsError('备注不能为空', 400)
  }

  const markdown = serializeTaskMarkdown({
    title,
    status: current.status,
    priority: input.priority ?? current.priority,
    humanNotes,
    agentNotes: current.agentNotes
  })
  writeFileSync(resolveSafeTaskFile(id), markdown, 'utf8')
  return readTask(id)
}

/**
 * 改状态：更新 markdown 中的 Status，并移动到对应目录（保留文件名）。
 *
 * 禁止写入 plan/。
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
  flushAndAssertReadable(dest)
  unlinkSync(src)

  return readTask(toPosixId(getTasksRoot(), dest))
}

/**
 * 删除任务 markdown 文件。不改动对话 JSON，由调用方另行清理。
 *
 * @param id - 当前 id
 */
export function deleteTask(id: string): void {
  const abs = resolveSafeTaskFile(id)
  if (!existsSync(abs)) {
    throw new TaskFsError('任务不存在', 404)
  }
  unlinkSync(abs)
}
