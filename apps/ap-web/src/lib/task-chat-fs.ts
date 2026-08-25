import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { ChatMessage } from '@/components/chat/chat-types'

import { getApWebAgentsRoot } from './ap-web-agents-root'

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
 * 拼出不含过程输出的对话 JSON（跳过 system / 空正文）。
 *
 * @param fileName - 任务文件名
 * @param prompt - 本轮发给 Agent 的用户侧正文
 * @param messages - 弹窗 transcript
 * @returns 落盘对象；无用户/助手内容时返回 null
 */
export function buildTaskChatPayload(
  fileName: string,
  prompt: string,
  messages: ChatMessage[]
): TaskChatPersisted | null {
  const persisted: TaskChatPersistedMessage[] = []
  const promptText = prompt.trim()
  if (promptText) {
    persisted.push({ role: 'user', content: promptText })
  }
  for (const item of messages) {
    if (item.role !== 'user' && item.role !== 'assistant') continue
    const text = item.content.trim()
    if (!text) continue
    persisted.push({ role: item.role, content: text })
  }
  if (persisted.length === 0) return null
  return { fileName: fileName.trim(), messages: persisted }
}

/**
 * 一轮对话结束后覆盖写入 chat JSON。无有效内容或路径非法则跳过。
 *
 * @param fileName - 任务文件名
 * @param prompt - 本轮 prompt
 * @param messages - 弹窗 transcript（含过程行，写入时过滤）
 */
export function writeTaskChatFile(fileName: string, prompt: string, messages: ChatMessage[]): void {
  const path = getTaskChatFilePath(fileName)
  if (!path) return
  const payload = buildTaskChatPayload(fileName, prompt, messages)
  if (!payload) return
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}
