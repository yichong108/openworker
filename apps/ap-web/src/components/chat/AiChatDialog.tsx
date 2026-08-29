'use client'

import { ChatSessionWithHttp } from '@openworker/ui'
import type { ChatTranscript } from '@/components/chat/chat-types'
import { ApModal } from '@/components/antd/ApModal'
import { apWebAntdTheme } from '@/components/antd/ap-web-antd-theme'
import { messageText, toChatSessionMessages } from '@/lib/agui-message'
import { request } from '@/lib/request'
import { App, ConfigProvider, Spin } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { useCallback, useEffect, useRef, useState } from 'react'

import '../../../../../packages/ui/src/chat-session/chat-session.scss'

const emptyTranscript = (): ChatTranscript => ({
  running: false,
  started: false,
  messages: [],
  liveEvents: []
})

function sameTranscriptTick(a: ChatTranscript | null, b: ChatTranscript): boolean {
  if (!a) return false
  const lastA = a.messages.at(-1)
  const lastB = b.messages.at(-1)
  return (
    a.running === b.running &&
    a.started === b.started &&
    a.error === b.error &&
    a.messages.length === b.messages.length &&
    a.liveEvents.length === b.liveEvents.length &&
    lastA?.id === lastB?.id &&
    lastA?.role === lastB?.role &&
    (lastA && lastB ? messageText(lastA) === messageText(lastB) : lastA === lastB) &&
    a.runStats?.durationMs === b.runStats?.durationMs
  )
}

type AiChatDialogProps = {
  open: boolean
  title: string
  fileName: string
  taskId: string
  /** 看板 SSE 推送的该任务会话；有则覆盖 hydrate */
  liveTranscript?: ChatTranscript
  onClose: () => void
  onAiAuthError: (message: string) => void
}

/**
 * 任务 AI 对话弹窗：ChatSessionWithHttp + 服务端 transcript 快照。
 */
export function AiChatDialog({
  open,
  title,
  fileName,
  taskId,
  liveTranscript,
  onClose,
  onAiAuthError
}: AiChatDialogProps) {
  const [hydrated, setHydrated] = useState<ChatTranscript | null>(null)
  const [hydrating, setHydrating] = useState(false)
  const readyFileNameRef = useRef<string | null>(null)

  const transcript = liveTranscript ?? hydrated ?? emptyTranscript()
  const showWorking = Boolean(transcript.running)

  useEffect(() => {
    if (!open) {
      readyFileNameRef.current = null
      setHydrated(null)
      return
    }
    if (!fileName) return
    if (liveTranscript) return

    let cancelled = false
    const pull = (showSpinner: boolean) => {
      if (showSpinner) setHydrating(true)
      void request(`/api/tasks/chat/send?fileName=${encodeURIComponent(fileName)}`)
        .then(async (response) => {
          const payload = (await response.json()) as {
            transcript?: ChatTranscript
            error?: string
            code?: string
          }
          if (cancelled) return
          const next = !response.ok ? emptyTranscript() : (payload.transcript ?? emptyTranscript())
          if (!response.ok && payload.code === 'ai_auth') {
            onAiAuthError(payload.error || '模型鉴权失败')
          }
          setHydrated((prev) => (sameTranscriptTick(prev, next) ? prev : next))
          readyFileNameRef.current = fileName
        })
        .catch(() => {
          if (!cancelled) {
            setHydrated(emptyTranscript())
            readyFileNameRef.current = fileName
          }
        })
        .finally(() => {
          if (!cancelled && showSpinner) setHydrating(false)
        })
    }

    pull(readyFileNameRef.current !== fileName)
    const timer = window.setInterval(() => pull(false), 400)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [open, fileName, liveTranscript, onAiAuthError])

  const onRunRequest = useCallback(
    async ({
      text,
      editMessageId,
      messages
    }: {
      text?: string
      editMessageId?: string
      messages: Array<{ id: string; role: 'user' | 'assistant'; content: string }>
    }) => {
      const lastUser = [...messages].reverse().find((item) => item.role === 'user')
      const payloadText = (text ?? lastUser?.content ?? '').trim()
      if (!payloadText) {
        throw new Error('缺少 text')
      }
      const response = await request('/api/tasks/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          text: payloadText,
          ...(editMessageId ? { messageId: editMessageId } : {})
        })
      })
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
        code?: string
      }
      if (!response.ok) {
        if (payload.code === 'ai_auth') {
          onAiAuthError(payload.error || '模型鉴权失败')
        }
        throw new Error(payload.error || `请求失败（${response.status}）`)
      }
    },
    [onAiAuthError, taskId]
  )

  const onStopRequest = useCallback(async () => {
    if (!fileName) return
    try {
      const response = await request('/api/tasks/chat/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName })
      })
      const payload = (await response.json().catch(() => ({}))) as { restoredInput?: string }
      return payload.restoredInput ? { restoredInput: payload.restoredInput } : undefined
    } catch {
      return undefined
    }
  }, [fileName])

  const sessionKey = fileName || readyFileNameRef.current || ''
  const ready = Boolean(sessionKey && (hydrated || liveTranscript) && !hydrating)

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
            {ready ? (
              <ChatSessionWithHttp
                key={sessionKey}
                sessionKey={sessionKey}
                snapshot={{
                  messages: toChatSessionMessages(transcript.messages, {
                    running: transcript.running,
                    assistantEvents: transcript.assistantEvents
                  }),
                  liveEvents: transcript.liveEvents,
                  isRun: transcript.running,
                  runStats: transcript.runStats
                }}
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
