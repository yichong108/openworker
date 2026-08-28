import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { getApWebAgentsRoot } from '@/ai/agents-root'
import { TaskFsError } from './task-fs-error'

/** 落盘的定时字段（不含运行时 nextAt） */
export type ToolboxSchedule = {
  enabled: boolean
  time: string
  loops: number
  remaining: number
}

/** web-data 中一条已添加工具 */
export type ToolboxRecord = {
  name: string
  userText: string
  schedule: ToolboxSchedule
}

const TIME_RE = /^\d{2}:\d{2}$/

/**
 * toolbox.json 的绝对路径：与任务目录同一棵 `.agents` 树（INIT_CWD，否则 cwd）。
 *
 * @returns 文件路径
 */
export function getToolboxFilePath(): string {
  return join(getApWebAgentsRoot(), 'ap-config', 'web-data', 'toolbox.json')
}

/**
 * 校验 skill 目录名，禁止路径穿越。
 *
 * @param name - 原始名称
 * @returns 是否可用
 */
export function isToolboxSkillName(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed) return false
  if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) return false
  if (trimmed.includes('\0')) return false
  return true
}

function blankSchedule(): ToolboxSchedule {
  return { enabled: false, time: '09:00', loops: 1, remaining: 1 }
}

/**
 * 把未知 JSON 收成合法定时对象。
 *
 * @param value - 原始 schedule
 * @returns 规范化结果
 */
function normalizeSchedule(value: unknown): ToolboxSchedule {
  const base = blankSchedule()
  if (!value || typeof value !== 'object') return base
  const item = value as Partial<ToolboxSchedule>
  const time = typeof item.time === 'string' && TIME_RE.test(item.time) ? item.time : base.time
  const loops = Math.max(1, Math.min(99, Number(item.loops) || 1))
  const remainingRaw = Math.max(0, Math.min(loops, Number(item.remaining) || loops))
  const enabled = Boolean(item.enabled)
  return {
    enabled,
    time,
    loops,
    remaining: enabled ? Math.max(1, remainingRaw) : remainingRaw
  }
}

/**
 * 把未知 JSON 收成一条工具记录；非法则返回 null。
 *
 * @param value - 原始元素
 * @returns 记录或 null
 */
function normalizeRecord(value: unknown): ToolboxRecord | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<ToolboxRecord>
  if (typeof item.name !== 'string' || !isToolboxSkillName(item.name)) return null
  return {
    name: item.name.trim(),
    userText: typeof item.userText === 'string' ? item.userText : '',
    schedule: normalizeSchedule(item.schedule)
  }
}

/**
 * 把未知 JSON 收成记录数组；非法文件当作空列表。
 * 同名只保留第一次出现。
 *
 * @param value - 解析后的 JSON
 * @returns 记录数组
 */
export function normalizeToolboxItems(value: unknown): ToolboxRecord[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const items: ToolboxRecord[] = []
  for (const entry of value) {
    const record = normalizeRecord(entry)
    if (!record || seen.has(record.name)) continue
    seen.add(record.name)
    items.push(record)
  }
  return items
}

/**
 * 读取已添加工具记录。
 *
 * @returns 已添加工具记录
 */
export function readToolboxItems(): ToolboxRecord[] {
  const file = getToolboxFilePath()
  if (!existsSync(file)) return []
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown
    return normalizeToolboxItems(parsed)
  } catch {
    return []
  }
}

/**
 * 覆盖写入 toolbox.json；目录不存在则创建。
 *
 * @param items - 待写入记录（须已校验）
 */
export function writeToolboxItems(items: ToolboxRecord[]): void {
  const file = getToolboxFilePath()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(items, null, 2)}\n`, 'utf8')
}

/**
 * 校验 PUT 请求体并规范化。
 *
 * @param body - 请求 JSON
 * @returns 可落盘的记录
 */
export function parseToolboxPutBody(body: unknown): ToolboxRecord[] {
  if (!body || typeof body !== 'object') {
    throw new TaskFsError('请求体无效', 400)
  }
  const items = (body as { items?: unknown }).items
  if (!Array.isArray(items)) {
    throw new TaskFsError('items 必须是数组', 400)
  }
  for (const entry of items) {
    if (!entry || typeof entry !== 'object') {
      throw new TaskFsError('工具记录无效', 400)
    }
    const name = (entry as { name?: unknown }).name
    if (typeof name !== 'string' || !isToolboxSkillName(name)) {
      throw new TaskFsError('非法 skill 名', 400)
    }
  }
  return normalizeToolboxItems(items)
}
