import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { Message } from '@ag-ui/client'

import { getApWebAgentsRoot } from '@/ai/agents-root'
import { takeCompletedRounds } from '@/lib/agui-message'

/** 一轮对话的 JSON 落盘结构 */
export type TaskChatPersisted = {
  fileName: string
  messages: Message[]
}

const MESSAGE_ROLES = new Set([
  'developer',
  'system',
  'assistant',
  'user',
  'tool',
  'activity',
  'reasoning'
])

let messageSeq = 0

/**
 * 生成会话消息 id。
 *
 * @returns 唯一 id
 */
function nextMessageId(): string {
  messageSeq += 1
  return `m${messageSeq}`
}

/**
 * 把落盘 JSON 条目收成 AG-UI Message（兼容旧的无 id 记录）。
 *
 * @param raw - JSON 条目
 * @returns Message；非法则 null
 */
function asPersistedMessage(raw: unknown): Message | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as { id?: unknown; role?: unknown }
  if (typeof row.role !== 'string' || !MESSAGE_ROLES.has(row.role)) return null
  const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : nextMessageId()
  return { ...(row as Message), id }
}

/**
 * 校验任务文件名，禁止路径穿越。
 *
 * @param fileName - 卡片上的任务文件名
 * @returns 是否可用来拼 chat 路径
 */
export function isSafeTaskChatFileName(fileName: string): boolean {
  const trimmed = fileName.trim()
  if (!trimmed) return false
  if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) return false
  if (trimmed.includes('\0')) return false
  return true
}

/**
 * 对话落盘绝对路径：`web-data/chat/{stem}-chat.json`。
 *
 * @param fileName - 任务文件名，如 `task-xxx.md`
 * @returns 绝对路径；非法文件名返回 null
 */
export function getTaskChatFilePath(fileName: string): string | null {
  if (!isSafeTaskChatFileName(fileName)) return null
  const stem = fileName.trim().replace(/\.md$/i, '')
  if (!stem) return null
  return join(getApWebAgentsRoot(), 'ap-config', 'web-data', 'chat', `${stem}-chat.json`)
}

/**
 * 从落盘 JSON 恢复 AG-UI Message[]（丢掉未完成回合）。
 *
 * @param fileName - 任务文件名
 * @returns 消息列表；无文件或解析失败时 []
 */
export function readTaskChatFile(fileName: string): Message[] {
  const path = getTaskChatFilePath(fileName)
  if (!path || !existsSync(path)) return []
  try {
    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw) as TaskChatPersisted
    if (!parsed.messages || !Array.isArray(parsed.messages)) return []
    const persisted: Message[] = []
    for (const item of parsed.messages) {
      const message = asPersistedMessage(item)
      if (message) persisted.push(message)
    }
    return takeCompletedRounds(persisted)
  } catch {
    return []
  }
}

/**
 * 拼出对话 JSON（丢掉未完成回合）。
 *
 * @param fileName - 任务文件名
 * @param messages - 会话 AG-UI 消息
 * @returns 落盘对象；无完整问答时返回 null
 */
export function buildTaskChatPayload(
  fileName: string,
  messages: Message[]
): TaskChatPersisted | null {
  const complete = takeCompletedRounds(messages)
  if (complete.length === 0) return null
  return { fileName: fileName.trim(), messages: complete }
}

/**
 * 一轮对话结束后覆盖写入 chat JSON。无完整问答则删除已有落盘。
 *
 * @param fileName - 任务文件名
 * @param messages - 会话 AG-UI 消息
 */
export function writeTaskChatFile(fileName: string, messages: Message[]): void {
  const path = getTaskChatFilePath(fileName)
  if (!path) return
  const payload = buildTaskChatPayload(fileName, messages)
  if (!payload) {
    deleteTaskChatFile(fileName)
    return
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

/**
 * 删除任务对话落盘文件；不存在或路径非法则忽略。
 *
 * @param fileName - 任务文件名
 */
export function deleteTaskChatFile(fileName: string): void {
  const path = getTaskChatFilePath(fileName)
  if (!path || !existsSync(path)) return
  unlinkSync(path)
}
