/**
 * 会话 AG-UI Message[] 进程内缓存与 hydrate/persist
 */

import type { Message } from '@ag-ui/client'

import { agentLog } from './agent-log.js'
import {
  getSessionMessages,
  patchSession,
  putSessionMessages
} from '../services/session-service.js'

/** 已从 SQLite 加载过的会话 */
const messagesHydrated = new Set<string>()

/** 会话消息内存缓存 */
const messagesBySession = new Map<string, Message[]>()

/**
 * 将 unknown[] 安全转为 AG-UI Message[]
 *
 * @param raw - 持久化层消息数组
 */
function asMessages(raw: unknown[]): Message[] {
  return raw as Message[]
}

/**
 * 读取进程内已缓存的消息（未 hydrate 时可能为空）。
 *
 * @param sessionId - 会话 ID
 */
export function getCachedSessionMessages(sessionId: string): Message[] {
  return messagesBySession.get(sessionId) ?? []
}

/**
 * 写入进程内消息缓存并标记已 hydrate。
 *
 * @param sessionId - 会话 ID
 * @param messages - AG-UI 消息
 */
export function seedSessionMessagesCache(sessionId: string, messages: Message[]): void {
  messagesBySession.set(sessionId, messages)
  messagesHydrated.add(sessionId)
}

/**
 * 确保会话消息已从 SQLite 加载到内存。
 *
 * @param sessionId - 会话 ID
 * @returns AG-UI Message 列表
 */
export async function ensureSessionMessagesLoaded(sessionId: string): Promise<Message[]> {
  if (messagesHydrated.has(sessionId)) {
    return getCachedSessionMessages(sessionId)
  }
  try {
    const payload = await getSessionMessages(sessionId)
    const messages = asMessages(payload.messages ?? [])
    seedSessionMessagesCache(sessionId, messages)
    return messages
  } catch (error) {
    agentLog.warn(
      `[session-messages] hydrate failed: ${error instanceof Error ? error.message : String(error)}`
    )
    seedSessionMessagesCache(sessionId, [])
    return []
  }
}

/**
 * 将完整 AG-UI Message[] 写入内存与 SQLite，并 touch 会话。
 *
 * @param sessionId - 会话 ID
 * @param messages - 完整 AG-UI 轨迹
 */
export async function persistSessionAguiMessages(
  sessionId: string,
  messages: Message[]
): Promise<void> {
  messagesBySession.set(sessionId, messages)
  messagesHydrated.add(sessionId)
  await putSessionMessages(sessionId, { messages })
  try {
    await patchSession(sessionId, { touch: true })
  } catch {
    // touch 失败不阻断主流程
  }
}

/**
 * 清除单个会话的消息缓存（删会话时调用）。
 *
 * @param sessionId - 会话 ID
 */
export function clearSessionMessagesCache(sessionId: string): void {
  messagesBySession.delete(sessionId)
  messagesHydrated.delete(sessionId)
}

/**
 * 清除全部会话消息缓存。
 */
export function clearAllSessionMessagesCache(): void {
  messagesBySession.clear()
  messagesHydrated.clear()
}
