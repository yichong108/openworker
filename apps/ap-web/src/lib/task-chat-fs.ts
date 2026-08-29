import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { ChatMessage } from '@/components/chat/chat-types'

import { getApWebAgentsRoot } from '@/ai/agents-root'

/** 落盘的一条用户/助手消息（不含过程行） */
export type TaskChatPersistedMessage = {
  role: 'user' | 'assistant'
  content: string
}

/** 一轮对话的 JSON 落盘结构 */
export type TaskChatPersisted = {
  fileName: string
  messages: TaskChatPersistedMessage[]
}

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
 * 只保留「用户 + 非空助手」成对回合。没有助手回复的 user 不落盘。
 *
 * @param messages - 已去掉 system / 空正文的消息
 * @returns 可落盘的成对消息
 */
function takeCompletedRounds(messages: TaskChatPersistedMessage[]): TaskChatPersistedMessage[] {
  const complete: TaskChatPersistedMessage[] = []
  let i = 0
  while (i < messages.length) {
    const item = messages[i]!
    const next = messages[i + 1]
    if (item.role === 'user' && next?.role === 'assistant') {
      complete.push(item, next)
      i += 2
      continue
    }
    if (item.role === 'user') {
      i += 1
      continue
    }
    complete.push(item)
    i += 1
  }
  return complete
}

/**
 * 从落盘 JSON 恢复 user/assistant 消息（无 aguiEvents，丢掉未完成回合）。
 *
 * @param fileName - 任务文件名
 * @returns 消息列表；无文件或解析失败时 []
 */
export function readTaskChatFile(fileName: string): ChatMessage[] {
  const path = getTaskChatFilePath(fileName)
  if (!path || !existsSync(path)) return []
  try {
    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw) as TaskChatPersisted
    if (!parsed.messages || !Array.isArray(parsed.messages)) return []
    const persisted: TaskChatPersistedMessage[] = []
    for (const item of parsed.messages) {
      if (item.role !== 'user' && item.role !== 'assistant') continue
      const text = typeof item.content === 'string' ? item.content.trim() : ''
      if (!text) continue
      persisted.push({ role: item.role, content: text })
    }
    return takeCompletedRounds(persisted).map((item) => ({
      id: nextMessageId(),
      role: item.role,
      content: item.content
    }))
  } catch {
    return []
  }
}

/**
 * 拼出不含过程输出的对话 JSON（跳过 system / 空正文 / 未完成回合）。
 *
 * @param fileName - 任务文件名
 * @param messages - 弹窗 transcript
 * @returns 落盘对象；无完整问答时返回 null
 */
export function buildTaskChatPayload(
  fileName: string,
  messages: ChatMessage[]
): TaskChatPersisted | null {
  const persisted: TaskChatPersistedMessage[] = []
  for (const item of messages) {
    if (item.role !== 'user' && item.role !== 'assistant') continue
    const text = item.content.trim()
    if (!text) continue
    persisted.push({ role: item.role, content: text })
  }
  const complete = takeCompletedRounds(persisted)
  if (complete.length === 0) return null
  return { fileName: fileName.trim(), messages: complete }
}

/**
 * 一轮对话结束后覆盖写入 chat JSON。无完整问答则删除已有落盘。
 *
 * @param fileName - 任务文件名
 * @param messages - 弹窗 transcript（含过程行，写入时过滤）
 */
export function writeTaskChatFile(fileName: string, messages: ChatMessage[]): void {
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
