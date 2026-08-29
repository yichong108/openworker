import {
  EventType,
  type BaseEvent,
  type CustomEvent,
  type RunErrorEvent,
  type RunFinishedEvent,
  type RunStartedEvent,
  type TextMessageContentEvent
} from '@ag-ui/client'

import {
  isAguiTimelineSourceEvent,
  TEXT_DELTA_CUSTOM_NAME,
  TEXT_REVOKE_CUSTOM_NAME
} from './agui-timeline.js'
import type { ChatSessionMessage, ChatSessionRunStats } from './types.js'

/** 消费 AG-UI 事件流的会话快照 */
export type LiveAgentSession = {
  messages: ChatSessionMessage[]
  liveEvents: BaseEvent[]
  isRun: boolean
  runStats?: ChatSessionRunStats
  streamBuf: string
  assistantId: string | null
}

/**
 * 空会话快照。
 *
 * @returns 初始 LiveAgentSession
 */
export function emptyLiveSession(): LiveAgentSession {
  return {
    messages: [],
    liveEvents: [],
    isRun: false,
    runStats: undefined,
    streamBuf: '',
    assistantId: null
  }
}

/**
 * 生成消息 id。
 *
 * @param prefix - 前缀
 * @returns 唯一 id
 */
export function nextMessageId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

/**
 * 将本轮 liveEvents 合并进最新 assistant，并结束流式标记。
 *
 * @param session - 当前快照
 * @returns 更新后的快照
 */
export function finalizeLiveSession(session: LiveAgentSession): LiveAgentSession {
  const durationMs = session.runStats?.startedAt
    ? Math.max(0, Date.now() - session.runStats.startedAt)
    : session.runStats?.durationMs
  const runStats =
    session.runStats && durationMs != null ? { ...session.runStats, durationMs } : session.runStats

  let messages = session.messages.map((item) =>
    item.streaming ? { ...item, streaming: false } : item
  )
  if (session.liveEvents.length > 0) {
    const next = [...messages]
    for (let i = next.length - 1; i >= 0; i -= 1) {
      const item = next[i]
      if (item?.role !== 'assistant') continue
      next[i] = {
        ...item,
        aguiEvents: [...(item.aguiEvents ?? []), ...session.liveEvents],
        streaming: false
      }
      break
    }
    messages = next
  }

  return {
    ...session,
    messages,
    liveEvents: [],
    isRun: false,
    runStats,
    streamBuf: '',
    assistantId: null
  }
}

/**
 * 停止且本轮无助手正文/过程事件时，去掉空 assistant 与这一轮 user。
 *
 * @param session - 已 finalize 的快照
 * @returns 去掉未完成轮次后的快照，以及应填回输入框的原文
 */
export function restoreUnansweredUserInput(session: LiveAgentSession): {
  session: LiveAgentSession
  restoredInput?: string
} {
  const messages = [...session.messages]
  const last = messages.at(-1)
  if (last?.role === 'assistant') {
    if (last.content.trim() || last.aguiEvents?.length) return { session }
    messages.pop()
  }
  const user = messages.at(-1)
  if (user?.role !== 'user') return { session }
  messages.pop()
  return { session: { ...session, messages }, restoredInput: user.content }
}

function patchAssistantContent(
  session: LiveAgentSession,
  content: string,
  streaming: boolean
): LiveAgentSession {
  const amId = session.assistantId
  if (!amId) return session
  const messages = [...session.messages]
  const idx = messages.findIndex((item) => item.id === amId)
  if (idx < 0) return session
  messages[idx] = { ...messages[idx]!, content, streaming }
  return { ...session, messages }
}

/**
 * 将一条 AG-UI `BaseEvent` 写入会话（对齐 ap-web / desktop 宿主）。
 *
 * @param session - 当前快照
 * @param event - Agent.run() 流出的事件
 * @returns 更新后的快照
 */
export function applyAguiEvent(session: LiveAgentSession, event: BaseEvent): LiveAgentSession {
  if (event.type === EventType.RUN_STARTED) {
    const e = event as RunStartedEvent
    const startedAt = e.timestamp ?? Date.now()
    const aid = nextMessageId('a')
    return {
      ...session,
      isRun: true,
      streamBuf: '',
      assistantId: aid,
      liveEvents: [],
      runStats: {
        runId: e.runId,
        traceId: `${e.threadId ?? 'session'}:${e.runId}`,
        startedAt,
        durationMs: 0
      },
      messages: [...session.messages, { id: aid, role: 'assistant', content: '', streaming: true }]
    }
  }

  if (event.type === EventType.CUSTOM) {
    const custom = event as CustomEvent
    if (custom.name === TEXT_DELTA_CUSTOM_NAME) {
      const delta =
        custom.value &&
        typeof custom.value === 'object' &&
        typeof (custom.value as { delta?: unknown }).delta === 'string'
          ? (custom.value as { delta: string }).delta
          : ''
      if (!delta) return session
      const streamBuf = session.streamBuf + delta
      return patchAssistantContent({ ...session, streamBuf }, streamBuf, true)
    }
    if (custom.name === TEXT_REVOKE_CUSTOM_NAME) {
      return patchAssistantContent({ ...session, streamBuf: '' }, '', true)
    }
    // cursor.thinking 等时间线 CUSTOM 落入 isAguiTimelineSourceEvent
  }

  if (event.type === EventType.TEXT_MESSAGE_CONTENT) {
    const e = event as TextMessageContentEvent
    const prev = session.streamBuf
    if (prev === e.delta) return session
    const streamBuf = prev.length > 0 && e.delta.startsWith(prev) ? e.delta : prev + e.delta
    return patchAssistantContent({ ...session, streamBuf }, streamBuf, true)
  }

  if (isAguiTimelineSourceEvent(event)) {
    if (event.type === EventType.RUN_ERROR) {
      const e = event as RunErrorEvent
      const cancelled = e.code === 'CANCELLED'
      const withEvent: LiveAgentSession = cancelled
        ? session
        : { ...session, liveEvents: [...session.liveEvents, event] }
      return finalizeLiveSession(withEvent)
    }
    return { ...session, liveEvents: [...session.liveEvents, event] }
  }

  if (event.type === EventType.RUN_FINISHED) {
    const e = event as RunFinishedEvent
    const finished = finalizeLiveSession(session)
    const startedAt = finished.runStats?.startedAt
    return {
      ...finished,
      runStats:
        startedAt != null
          ? {
              ...finished.runStats,
              durationMs: Math.max(0, (e.timestamp ?? Date.now()) - startedAt)
            }
          : finished.runStats
    }
  }

  return session
}
