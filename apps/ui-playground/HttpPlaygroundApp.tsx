import type { BaseEvent } from '@ag-ui/client'
import { Button } from 'antd'
import { useCallback, useState } from 'react'

import { ChatSessionWithHttp } from '@openworker/ui'
import { consumeSse } from './consume-sse'
import { PlaygroundHeader } from './PlaygroundHeader'

/**
 * ChatSessionWithHttp 联调页：宿主适配 playground 的 /api/agent/run|stop。
 */
export function HttpPlaygroundApp() {
  const [sessionKey, setSessionKey] = useState(0)

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
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({ messages })
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(err.message || `请求失败（${res.status}）`)
      }
      await consumeSse(res, onEvent, signal)
    },
    []
  )

  const onStopRequest = useCallback(() => {
    void fetch('/api/agent/stop', { method: 'POST' })
  }, [])

  const clearSession = useCallback(() => {
    setSessionKey((prev) => prev + 1)
  }, [])

  return (
    <div className="ow-ui-playground">
      <PlaygroundHeader
        extra={
          <Button size="small" onClick={clearSession}>
            清空会话
          </Button>
        }
        hint="ChatSessionWithHttp · onRunRequest/onStopRequest · 需配置 DEEPSEEK_API_KEY"
      />
      <div className="ow-ui-playground-stage app-shell is-live">
        <ChatSessionWithHttp
          key={sessionKey}
          sessionKey={`http-${sessionKey}`}
          onRunRequest={onRunRequest}
          onStopRequest={onStopRequest}
        />
      </div>
    </div>
  )
}
