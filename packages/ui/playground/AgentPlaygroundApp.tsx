import type { BaseEvent } from '@ag-ui/client'
import type { AgentComposerMode } from '@openworker/shared'
import { App as AntdApp, Button, Input } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'

import { ChatSessionView } from '../src/index.js'
import type { ChatSessionMessage } from '../src/chat-session/types.js'
import {
  applyAguiEvent,
  emptyLiveSession,
  finalizeLiveSession,
  nextMessageId,
  type LiveAgentSession
} from './apply-agui-event'
import { PlaygroundHeader } from './PlaygroundHeader'

const STORAGE_KEY = 'ow-ui-playground-base-agent'

type AgentConn = {
  apiKey: string
  baseURL: string
  model: string
}

const DEFAULT_CONN: AgentConn = {
  apiKey: '',
  baseURL: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat'
}

/**
 * 读取本地保存的模型连接。
 *
 * @returns 连接配置
 */
function loadConn(): AgentConn {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_CONN }
    const parsed = JSON.parse(raw) as Partial<AgentConn>
    return {
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      baseURL:
        typeof parsed.baseURL === 'string' && parsed.baseURL
          ? parsed.baseURL
          : DEFAULT_CONN.baseURL,
      model: typeof parsed.model === 'string' && parsed.model ? parsed.model : DEFAULT_CONN.model
    }
  } catch {
    return { ...DEFAULT_CONN }
  }
}

/**
 * 消费 SSE：每条 `data:` 回调一次（BaseAgentWithAGUI 的 BaseEvent）。
 *
 * @param response - fetch 响应
 * @param onEvent - 事件回调
 * @param signal - 取消
 */
async function consumeSse(
  response: Response,
  onEvent: (event: unknown) => void,
  signal: AbortSignal
): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('响应没有可读流')
  const decoder = new TextDecoder()
  let buf = ''
  while (!signal.aborted) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const blocks = buf.split('\n\n')
    buf = blocks.pop() ?? ''
    for (const block of blocks) {
      const dataLine = block.split('\n').find((line) => line.startsWith('data:'))
      if (!dataLine) continue
      const data = dataLine.slice(5).trim()
      if (!data || data === '{}') continue
      onEvent(JSON.parse(data) as unknown)
    }
  }
}

/**
 * ChatSessionView 接入 BaseAgentWithAGUI 的预览页。
 *
 * 浏览器只消费 AG-UI SSE；真正的 `agent.run()` 在 Vite 中间件里执行。
 */
export function AgentPlaygroundApp() {
  const { message: msgApi } = AntdApp.useApp()
  const [input, setInput] = useState('')
  const [composerMode, setComposerMode] = useState<AgentComposerMode>('build')
  const [conn, setConn] = useState<AgentConn>(loadConn)
  const [hasEnvKey, setHasEnvKey] = useState(false)
  const [cwdLabel, setCwdLabel] = useState('')
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
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conn))
    } catch {
      /* ignore quota */
    }
  }, [conn])

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/agent/status')
        if (!res.ok) return
        const data = (await res.json()) as {
          hasEnvKey?: boolean
          defaultBaseURL?: string
          defaultModel?: string
          cwd?: string
        }
        setHasEnvKey(Boolean(data.hasEnvKey))
        if (typeof data.cwd === 'string') setCwdLabel(data.cwd)
        setConn((prev) => ({
          ...prev,
          baseURL: prev.baseURL || data.defaultBaseURL || DEFAULT_CONN.baseURL,
          model: prev.model || data.defaultModel || DEFAULT_CONN.model
        }))
      } catch {
        /* 中间件未就绪时保持默认 */
      }
    })()
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const hasKey = Boolean(conn.apiKey.trim() || hasEnvKey)

  const runAgent = useCallback(
    async (history: ChatSessionMessage[]) => {
      abortRef.current?.abort()
      const abort = new AbortController()
      abortRef.current = abort
      flush({ ...sessionRef.current, messages: history, isRun: true, liveEvents: [] })

      try {
        const res = await fetch('/api/agent/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abort.signal,
          body: JSON.stringify({
            messages: history
              .filter((item) => item.role === 'user' || item.role === 'assistant')
              .filter((item) => item.content.trim())
              .map((item) => ({ id: item.id, role: item.role, content: item.content })),
            apiKey: conn.apiKey,
            baseURL: conn.baseURL,
            model: conn.model
          })
        })
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { message?: string }
          msgApi.error(err.message || `请求失败（${res.status}）`)
          flush(finalizeLiveSession({ ...sessionRef.current, isRun: false }))
          return
        }
        await consumeSse(
          res,
          (event) => {
            if (!event || typeof event !== 'object' || !('type' in event)) return
            flush(applyAguiEvent(sessionRef.current, event as BaseEvent))
          },
          abort.signal
        )
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
    [conn.apiKey, conn.baseURL, conn.model, flush, msgApi]
  )

  const send = useCallback(() => {
    const text = input.trim()
    if (!text || isRun) return
    if (!hasKey) {
      msgApi.warning('请先填写 API Key，或配置 DEEPSEEK_API_KEY')
      return
    }
    const user: ChatSessionMessage = { id: nextMessageId('u'), role: 'user', content: text }
    setInput('')
    void runAgent([...sessionRef.current.messages, user])
  }, [hasKey, input, isRun, msgApi, runAgent])

  const stopRun = useCallback(() => {
    abortRef.current?.abort()
    void fetch('/api/agent/stop', { method: 'POST' }).catch(() => undefined)
    flush(finalizeLiveSession(sessionRef.current))
    msgApi.info('已停止 Base Agent')
  }, [flush, msgApi])

  const clearSession = useCallback(() => {
    if (isRun) stopRun()
    flush(emptyLiveSession())
    setInput('')
  }, [flush, isRun, stopRun])

  const workspaceName =
    cwdLabel
      .replace(/[\\/]+$/, '')
      .split(/[\\/]/)
      .pop() || '仓库根目录'

  return (
    <div className="ow-ui-playground">
      <PlaygroundHeader
        extra={
          <Button size="small" onClick={clearSession} disabled={messages.length === 0 && !isRun}>
            清空会话
          </Button>
        }
        hint="BaseAgentWithAGUI.run() · AG-UI SSE · 仅 shell 工具"
      />
      <div className="ow-ui-playground-config">
        <Input.Password
          size="small"
          placeholder={hasEnvKey ? 'API Key（已读到环境变量，可留空）' : 'API Key'}
          value={conn.apiKey}
          onChange={(e) => setConn((prev) => ({ ...prev, apiKey: e.target.value }))}
          autoComplete="off"
        />
        <Input
          size="small"
          placeholder="Base URL"
          value={conn.baseURL}
          onChange={(e) => setConn((prev) => ({ ...prev, baseURL: e.target.value }))}
        />
        <Input
          size="small"
          placeholder="Model"
          value={conn.model}
          onChange={(e) => setConn((prev) => ({ ...prev, model: e.target.value }))}
        />
        <span className="ow-ui-playground-config-cwd" title={cwdLabel}>
          cwd {workspaceName}
        </span>
      </div>
      <div className="ow-ui-playground-stage app-shell is-live">
        <ChatSessionView
          isLoading={false}
          isEmpty={messages.length === 0 && !isRun}
          messages={messages}
          liveEvents={liveEvents}
          isRun={isRun}
          runStats={runStats}
          sessionKey="base-agent"
          onStopRun={stopRun}
          onEditResend={(messageId, text) => {
            const trimmed = text.trim()
            if (!trimmed || isRun) return
            if (!hasKey) {
              msgApi.warning('请先填写 API Key')
              return
            }
            const idx = sessionRef.current.messages.findIndex((item) => item.id === messageId)
            if (idx < 0 || sessionRef.current.messages[idx]?.role !== 'user') return
            const history = [
              ...sessionRef.current.messages.slice(0, idx),
              { ...sessionRef.current.messages[idx]!, content: trimmed, aguiEvents: undefined }
            ]
            void runAgent(history)
          }}
          onOpenExternal={async (href) => {
            window.open(href, '_blank', 'noopener,noreferrer')
            return { ok: true }
          }}
          emptyToolbar={
            <div className="app-composer-toolbar">
              <button type="button" className="app-composer-workspace-trigger">
                <span className="app-composer-workspace-trigger-body">
                  <span className="app-composer-workspace-name">{workspaceName}</span>
                </span>
              </button>
            </div>
          }
          composer={{
            value: input,
            onChange: (value) => setInput(value),
            onSend: send,
            canSend: input.trim().length > 0 && hasKey,
            sendDisabled: !hasKey,
            placeholder: hasKey
              ? '接入 BaseAgentWithAGUI，Enter 发送（仅 shell）'
              : '先填写 API Key 或配置 DEEPSEEK_API_KEY',
            composerMode,
            onComposerModeChange: setComposerMode
          }}
        />
      </div>
    </div>
  )
}
