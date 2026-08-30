'use client'

import type { BaseEvent } from '@ag-ui/client'
import { ChatSessionWithHttp } from '@openworker/ui'
import type { ChatTranscript } from '@/components/chat/chat-types'
import { ApModal } from '@/components/antd/ApModal'
import { apWebAntdTheme } from '@/components/antd/ap-web-antd-theme'
import { historyBeforeCurrentRun, toChatSessionMessages } from '@/lib/agui-message'
import { consumeSse } from '@/lib/consume-sse'
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

type AiChatDialogProps = {
  open: boolean
  title: string
  fileName: string
  taskId: string
  /** 看板 hint：仅用于标题 Working */
  liveRunning?: boolean
  onClose: () => void
  onAiAuthError: (message: string) => void
}

/**
 * 任务 AI 对话弹窗：先拉历史作 initialMessages；流式事件由 onRunRequest 订流。
 */
export function AiChatDialog({
  open,
  title,
  fileName,
  taskId,
  liveRunning,
  onClose,
  onAiAuthError
}: AiChatDialogProps) {
  const [hydrated, setHydrated] = useState<ChatTranscript | null>(null)
  const [hydrating, setHydrating] = useState(false)
  const readyFileNameRef = useRef<string | null>(null)
  const onAiAuthErrorRef = useRef(onAiAuthError)
  onAiAuthErrorRef.current = onAiAuthError

  const showWorking = Boolean(liveRunning ?? hydrated?.running)

  useEffect(() => {
    if (!open) {
      readyFileNameRef.current = null
      setHydrated(null)
      return
    }
    if (!fileName) return

    let cancelled = false
    const firstLoad = readyFileNameRef.current !== fileName
    if (firstLoad) setHydrating(true)
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
          onAiAuthErrorRef.current(payload.error || '模型鉴权失败')
        }
        setHydrated(next)
        readyFileNameRef.current = fileName
      })
      .catch(() => {
        if (!cancelled) {
          setHydrated(emptyTranscript())
          readyFileNameRef.current = fileName
        }
      })
      .finally(() => {
        if (!cancelled && firstLoad) setHydrating(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, fileName])

  const onRunRequest = useCallback(
    async ({
      text,
      editMessageId,
      messages,
      signal,
      onEvent,
      reconnect
    }: {
      text?: string
      editMessageId?: string
      messages: Array<{ id: string; role: 'user' | 'assistant'; content: string }>
      signal: AbortSignal
      onEvent: (event: BaseEvent) => void
      reconnect?: boolean
    }) => {
      if (!reconnect) {
        const lastUser = [...messages].reverse().find((item) => item.role === 'user')
        const payloadText = (text ?? lastUser?.content ?? '').trim()
        if (!payloadText) {
          throw new Error('缺少 text')
        }
        const response = await request('/api/tasks/chat/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal,
          body: JSON.stringify({
            taskId,
            text: payloadText,
            ...(editMessageId
              ? { messageId: editMessageId }
              : lastUser?.id
                ? { userMessageId: lastUser.id }
                : {})
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
      }

      if (!fileName) return
      const streamRes = await request(
        `/api/tasks/chat/stream?fileName=${encodeURIComponent(fileName)}`,
        { signal }
      )
      if (!streamRes.ok) {
        throw new Error(`无法订阅对话事件（${streamRes.status}）`)
      }
      await consumeSse(streamRes, onEvent, signal)
    },
    [fileName, onAiAuthError, taskId]
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

  const loadSkills = useCallback(async () => {
    const response = await request('/api/skills')
    const payload = (await response.json()) as {
      skills?: Array<{ name: string; summary: string; source?: string }>
    }
    if (!response.ok) return []
    return (payload.skills ?? []).map((skill) => ({
      name: skill.name,
      description: skill.summary,
      source: skill.source ?? 'builtin'
    }))
  }, [])

  const sessionKey = fileName || readyFileNameRef.current || ''
  const ready = Boolean(sessionKey && hydrated && !hydrating)
  const history = hydrated
    ? toChatSessionMessages(historyBeforeCurrentRun(hydrated.messages, hydrated.running), {
        assistantEvents: hydrated.assistantEvents
      })
    : []

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
                initialMessages={history}
                initialIsRun={hydrated?.running}
                initialRunStats={hydrated?.running ? hydrated.runStats : undefined}
                onRunRequest={onRunRequest}
                onStopRequest={onStopRequest}
                loadSkills={loadSkills}
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
