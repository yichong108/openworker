/**
 * 从模板创建 task / decision 文件到 `.agents/ap-config/work-data`。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { getPackageRoot } from './env.js'

/** 可创建的 work-data 条目类型 */
export type WorkDataKind = 'task' | 'decision'

/** 创建 task / decision 所需参数 */
export type CreateWorkDataInput = {
  /** task 写入 todo/，decision 写入 decisions/ */
  kind: WorkDataKind
  /** 仓库工作区根目录 */
  cwd: string
  /** 文件名（可带或不带 .md）；省略则按时间戳命名 */
  name?: string
}

/**
 * 生成本地时间戳，格式 YYYYMMDDHHmmSS。
 *
 * @param date - 基准时间，默认当前本地时间
 * @returns 14 位数字时间戳
 */
export function formatLocalTimestamp(date: Date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('')
}

/**
 * 解析创建文件的最终文件名。
 *
 * 未指定 name 时为 `<kind>-YYYYMMDDHHmmSS.md`；
 * 指定时使用该名称，缺 `.md` 则补上。不允许路径分隔或 `..`。
 *
 * @param kind - task 或 decision
 * @param name - 用户传入的 --name
 * @returns 仅含文件名（不含目录）
 */
export function resolveCreateFileName(kind: WorkDataKind, name?: string): string {
  const trimmed = name?.trim()
  if (!trimmed) {
    return `${kind}-${formatLocalTimestamp()}.md`
  }

  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) {
    throw new Error('--name 不能包含路径')
  }

  const fileName = trimmed.toLowerCase().endsWith('.md') ? trimmed : `${trimmed}.md`
  if (fileName === '.md' || basename(fileName) !== fileName) {
    throw new Error('--name 不是合法文件名')
  }
  return fileName
}

/**
 * 读取 task / decision 模板正文。
 *
 * 优先用工作区已安装的模板（安装时由种子覆盖 `*-template.md`）；
 * 工作区没有时回退到包内种子。
 *
 * @param kind - task 或 decision
 * @param cwd - 仓库工作区根目录
 * @returns 模板全文
 */
function readTemplate(kind: WorkDataKind, cwd: string): string {
  const relative =
    kind === 'task' ? join('tasks', 'task-template.md') : join('decisions', 'decision-template.md')

  const candidates = [
    join(cwd, '.agents', 'ap-config', 'work-data', relative),
    join(getPackageRoot(), 'src', 'ap-config', 'work-data', relative)
  ]

  for (const path of candidates) {
    if (existsSync(path)) {
      return readFileSync(path, 'utf8')
    }
  }

  throw new Error(`未找到 ${kind} 模板: ${relative}`)
}

/**
 * 从模板创建一份 task 或 decision 文件。
 *
 * task 写到 `tasks/todo/`，decision 写到 `decisions/`。
 * 目标已存在则报错，不覆盖。
 *
 * @param input - 类型、工作区与可选文件名
 * @returns 新文件的绝对路径
 */
export function createWorkDataFile(input: CreateWorkDataInput): string {
  const fileName = resolveCreateFileName(input.kind, input.name)
  const destDir =
    input.kind === 'task'
      ? join(input.cwd, '.agents', 'ap-config', 'work-data', 'tasks', 'todo')
      : join(input.cwd, '.agents', 'ap-config', 'work-data', 'decisions')
  const dest = join(destDir, fileName)

  if (existsSync(dest)) {
    throw new Error(`文件已存在: ${dest}`)
  }

  mkdirSync(destDir, { recursive: true })
  writeFileSync(dest, readTemplate(input.kind, input.cwd), 'utf8')
  return dest
}
