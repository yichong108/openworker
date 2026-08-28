import type { BaseEvent } from '@ag-ui/client'
import type { AgentComposerMode } from '@openworker/shared'
import { App as AntdApp } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  applyAguiEvent,
  emptyLiveSession,
  finalizeLiveSession,
  nextMessageId,
  type LiveAgentSession
} from './apply-agui-event.js'
import { ChatSessionView } from './ChatSessionView.js'
import type { ChatSessionMessage, ChatSessionWithHttpProps } from './types.js'

function toRunMessages(messages: ChatSessionMessage[]) {
  return messages
    .filter((item) => item.role === 'user' || item.role === 'assistant')
    .filter((item) => item.content.trim())
    .map((item) => ({
      id: item.id,
      role: item.role as 'user' | 'assistant',
      content: item.content
    }))
}

/**
 * 自包含聊天会话：内部管 AG-UI 事件与会话状态，run/stop 由宿主回调实现。
 *
 * @param props - onRunRequest / onStopRequest
 */
export function ChatSessionWithHttp({
  onRunRequest,
  onStopRequest,
  sessionKey = 'http-session',
  className
}: ChatSessionWithHttpProps) {
  const { message: msgApi } = AntdApp.useApp()
  const [input, setInput] = useState('')
  const [composerMode, setComposerMode] = useState<AgentComposerMode>('build')
  const [messages, setMessages] = useState<ChatSessionMessage[]>([])
  const [liveEvents, setLiveEvents] = useState(emptyLiveSession().liveEvents)
  const [isRun, setIsRun] = useState(false)
  const [runStats, setRunStats] = useState(emptyLiveSession().runStats)
  const sessionRef = useRef<LiveAgentSession>(emptyLiveSession())
  const abortRef = useRef<AbortController | null>(null)

  const flush = useCallback((next: LiveAgentSession) => {
    sessionRef.current = next
    setMessages(next.messages)
    setLiveEvents(next.liveEvents)
    setIsRun(next.isRun)
    setRunStats(next.runStats)
  }, [])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const runSession = useCallback(
    async (history: ChatSessionMessage[]) => {
      abortRef.current?.abort()
      const abort = new AbortController()
      abortRef.current = abort
      flush({ ...sessionRef.current, messages: history, isRun: true, liveEvents: [] })

      try {
        await onRunRequest({
          messages: toRunMessages(history),
          signal: abort.signal,
          onEvent: (event) => {
            if (!event || typeof event !== 'object' || !('type' in event)) return
            flush(applyAguiEvent(sessionRef.current, event as BaseEvent))
          }
        })
        if (sessionRef.current.isRun) {
          flush(finalizeLiveSession(sessionRef.current))
        }
      } catch (error) {
        if (abort.signal.aborted) {
          flush(finalizeLiveSession(sessionRef.current))
          return
        }
        msgApi.error(error instanceof Error ? error.message : String(error))
        flush(finalizeLiveSession(sessionRef.current))
      }
    },
    [flush, msgApi, onRunRequest]
  )

  const send = useCallback(() => {
    const text = input.trim()
    if (!text || isRun) return
    const user: ChatSessionMessage = { id: nextMessageId('u'), role: 'user', content: text }
    setInput('')
    void runSession([...sessionRef.current.messages, user])
  }, [input, isRun, runSession])

  const stopRun = useCallback(() => {
    abortRef.current?.abort()
    void onStopRequest()
    flush(finalizeLiveSession(sessionRef.current))
  }, [flush, onStopRequest])

  return (
    <ChatSessionView
      className={className}
      isLoading={false}
      isEmpty={messages.length === 0 && !isRun}
      messages={messages}
      liveEvents={liveEvents}
      isRun={isRun}
      runStats={runStats}
      sessionKey={sessionKey}
      onStopRun={stopRun}
      onEditResend={(messageId, text) => {
        const trimmed = text.trim()
        if (!trimmed || isRun) return
        const idx = sessionRef.current.messages.findIndex((item) => item.id === messageId)
        if (idx < 0 || sessionRef.current.messages[idx]?.role !== 'user') return
        const history = [
          ...sessionRef.current.messages.slice(0, idx),
          { ...sessionRef.current.messages[idx]!, content: trimmed, aguiEvents: undefined }
        ]
        void runSession(history)
      }}
      onOpenExternal={async (href) => {
        window.open(href, '_blank', 'noopener,noreferrer')
        return { ok: true }
      }}
      composer={{
        value: input,
        onChange: (value) => setInput(value),
        onSend: send,
        canSend: input.trim().length > 0,
        composerMode,
        onComposerModeChange: setComposerMode
      }}
    />
  )
}
