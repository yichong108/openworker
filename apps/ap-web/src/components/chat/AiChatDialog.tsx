'use client'

import type { BaseEvent } from '@ag-ui/client'
import { ChatSessionWithHttp, type ChatSessionMessage } from '@openworker/ui'
import type { ChatTranscript } from '@/components/chat/chat-types'
import { ApModal } from '@/components/antd/ApModal'
import { apWebAntdTheme } from '@/components/antd/ap-web-antd-theme'
import { consumeSse } from '@/ai/consume-sse'
import { App, ConfigProvider, Spin } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { useCallback, useEffect, useRef, useState } from 'react'

import '../../../../../packages/ui/src/chat-session/chat-session.scss'

const transcriptCache = new Map<string, ChatTranscript>()

const emptyTranscript = (): ChatTranscript => ({
  running: false,
  started: false,
  messages: [],
  liveEvents: []
})

type AiChatDialogProps = {
  open: boolean
  title: string
  fileName: string
  taskId: string
  onClose: () => void
  onAiAuthError: (message: string) => void
}

/**
 * 任务 AI 对话弹窗：ApModal + ChatSessionWithHttp（自包含会话）。
 */
export function AiChatDialog({
  open,
  title,
  fileName,
  taskId,
  onClose,
  onAiAuthError
}: AiChatDialogProps) {
  const [hydrated, setHydrated] = useState<ChatTranscript | null>(null)
  const [hydrating, setHydrating] = useState(false)
  const [working, setWorking] = useState(false)
  const readyFileNameRef = useRef<string | null>(null)

  useEffect(() => {
    if (!open || !fileName) return

    if (readyFileNameRef.current === fileName) {
      return
    }

    const cached = transcriptCache.get(fileName)
    if (cached) {
      setHydrated(cached)
      setHydrating(false)
      setWorking(Boolean(cached.running))
      readyFileNameRef.current = fileName
      return
    }

    let cancelled = false
    setHydrating(true)

    void fetch(`/api/tasks/chat/send?fileName=${encodeURIComponent(fileName)}`, {
      cache: 'no-store'
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          transcript?: ChatTranscript
          error?: string
          code?: string
        }
        if (cancelled) return
        const transcript = !response.ok
          ? emptyTranscript()
          : (payload.transcript ?? emptyTranscript())
        if (!response.ok && payload.code === 'ai_auth') {
          onAiAuthError(payload.error || '模型鉴权失败')
        }
        transcriptCache.set(fileName, transcript)
        setHydrated(transcript)
        setWorking(Boolean(transcript.running))
        readyFileNameRef.current = fileName
      })
      .catch(() => {
        if (!cancelled) {
          const transcript = emptyTranscript()
          transcriptCache.set(fileName, transcript)
          setHydrated(transcript)
          readyFileNameRef.current = fileName
        }
      })
      .finally(() => {
        if (!cancelled) setHydrating(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, fileName, onAiAuthError])

  const sessionKey = fileName || readyFileNameRef.current || ''

  const onRunRequest = useCallback(
    async ({
      messages,
      signal,
      onEvent
    }: {
      messages: Array<{ id: string; role: 'user' | 'assistant'; content: string }>
      signal: AbortSignal
      onEvent: (event: BaseEvent) => void
    }) => {
      setWorking(true)
      try {
        const response = await fetch('/api/tasks/chat/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal,
          body: JSON.stringify({ taskId, messages })
        })
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string
            code?: string
          }
          if (payload.code === 'ai_auth') {
            onAiAuthError(payload.error || '模型鉴权失败')
          }
          throw new Error(payload.error || `请求失败（${response.status}）`)
        }
        await consumeSse(response, onEvent, signal)
      } finally {
        setWorking(false)
      }
    },
    [onAiAuthError, taskId]
  )

  const onStopRequest = useCallback(async () => {
    if (!fileName) return
    try {
      await fetch('/api/tasks/chat/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName })
      })
    } catch {
      /* stop 失败不阻断 UI */
    }
    setWorking(false)
  }, [fileName])

  const initialMessages: ChatSessionMessage[] = hydrated?.messages ?? []
  const showWorking = working || Boolean(hydrated?.running)

  return (
    <ApModal
      open={open}
      onClose={onClose}
      width={820}
      footer={null}
      classNames={{ content: 'ap-modal-content--chat' }}
      title={
        <div className="min-w-0 pr-6">
          <p className="truncate font-display text-2xl">{title}</p>
          {showWorking ? <p className="mt-1 text-xs text-[var(--teal)]">Working</p> : null}
        </div>
      }
    >
      <ConfigProvider locale={zhCN} theme={apWebAntdTheme}>
        <App>
          <div className="ap-task-chat-session flex min-h-0 flex-1 flex-col">
            {sessionKey && hydrated && !hydrating ? (
              <ChatSessionWithHttp
                key={sessionKey}
                sessionKey={sessionKey}
                initialMessages={initialMessages}
                initialLiveEvents={hydrated.liveEvents}
                initialIsRun={hydrated.running}
                initialRunStats={hydrated.runStats}
                onRunRequest={onRunRequest}
                onStopRequest={onStopRequest}
              />
            ) : open && fileName ? (
              <div className="flex flex-1 items-center justify-center">
                <Spin />
              </div>
            ) : null}
          </div>
        </App>
      </ConfigProvider>
    </ApModal>
  )
}
