import type { BaseEvent } from '@ag-ui/client'
import { Button, Modal } from 'antd'
import { useCallback, useState } from 'react'

import { ChatSessionWithHttp } from '@openworker/ui'
import { consumeSse } from './consume-sse'
import { MOCK_HISTORY_MESSAGES } from './mock-session'
import { PlaygroundHeader } from './PlaygroundHeader'

/**
 * ChatSessionWithHttp 对话框预览：Modal 内嵌会话，演示 initialMessages。
 */
export function HttpDialogPlaygroundApp() {
  const [open, setOpen] = useState(false)
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

  const openDialog = useCallback(() => {
    setSessionKey((prev) => prev + 1)
    setOpen(true)
  }, [])

  return (
    <div className="ow-ui-playground">
      <PlaygroundHeader
        extra={
          <Button size="small" type="primary" onClick={openDialog}>
            打开对话
          </Button>
        }
        hint="Modal + ChatSessionWithHttp · initialMessages · /api/agent/run|stop"
      />
      <div className="ow-ui-playground-stage ow-ui-playground-stage--dialog-demo">
        <p className="ow-ui-playground-dialog-hint">
          点击「打开对话」在 Modal 中预览 ChatSessionWithHttp；初始消息来自 mock 历史。
        </p>
      </div>

      <Modal
        open={open}
        title="AI 对话"
        width={672}
        footer={null}
        destroyOnClose
        onCancel={() => setOpen(false)}
        classNames={{ content: 'ow-playground-modal-content--chat' }}
      >
        <div className="ow-playground-chat-session">
          <ChatSessionWithHttp
            key={sessionKey}
            sessionKey={`dialog-${sessionKey}`}
            initialMessages={MOCK_HISTORY_MESSAGES}
            onRunRequest={onRunRequest}
            onStopRequest={onStopRequest}
          />
        </div>
      </Modal>
    </div>
  )
}
