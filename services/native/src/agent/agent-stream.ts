/**
 * 会话级 AG-UI 事件广播（供 SSE 路由订阅）
 */

import type { BaseEvent } from '@ag-ui/client'

/** AGENT_STREAM 载荷：AG-UI BaseEvent + sessionId 信封 */
export type AgentStreamPayload = {
  sessionId: string
  event: BaseEvent
}

/** 流式事件监听器 */
export type AgentStreamListener = (payload: AgentStreamPayload) => void

const listenersBySession = new Map<string, Set<AgentStreamListener>>()

/**
 * 订阅指定会话的 AG-UI 流式事件。
 *
 * @param sessionId - 会话 ID
 * @param listener - 事件回调
 * @returns 取消订阅函数
 */
export function subscribeSessionStream(
  sessionId: string,
  listener: AgentStreamListener
): () => void {
  let set = listenersBySession.get(sessionId)
  if (!set) {
    set = new Set()
    listenersBySession.set(sessionId, set)
  }
  set.add(listener)
  return () => {
    const current = listenersBySession.get(sessionId)
    if (!current) return
    current.delete(listener)
    if (current.size === 0) {
      listenersBySession.delete(sessionId)
    }
  }
}

/**
 * 向订阅方推送会话 AG-UI 事件。
 *
 * @param payload - sessionId + BaseEvent
 */
export function emitSessionStream(payload: AgentStreamPayload): void {
  const set = listenersBySession.get(payload.sessionId)
  if (!set || set.size === 0) return
  for (const listener of set) {
    try {
      listener(payload)
    } catch (error) {
      console.warn(
        '[native:agent-stream] listener error:',
        error instanceof Error ? error.message : String(error)
      )
    }
  }
}
