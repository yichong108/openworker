'use client'

import { ChatSessionView } from '@openworker/ui'
import type { ChatTranscript } from '@/components/chat/chat-types'
import { ApModal } from '@/components/antd/ApModal'
import { apWebAntdTheme } from '@/components/antd/ap-web-antd-theme'
import { App, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'

import '../../../../../packages/ui/src/chat-session/chat-session.scss'

type AiChatDialogProps = {
  open: boolean
  title: string
  fileName: string
  transcript: ChatTranscript | undefined
  chatInput: string
  onChatInputChange: (value: string) => void
  onClose: () => void
  onSend: () => void
  onStop: () => void
  onEditResend: (messageId: string, text: string) => void | Promise<void>
  sendDisabled?: boolean
}

/**
 * 任务 AI 对话弹窗：ApModal + ChatSessionView。
 */
export function AiChatDialog({
  open,
  title,
  fileName,
  transcript,
  chatInput,
  onChatInputChange,
  onClose,
  onSend,
  onStop,
  onEditResend,
  sendDisabled
}: AiChatDialogProps) {
  const messages = transcript?.messages ?? []
  const isRun = Boolean(transcript?.running)

  return (
    <ApModal
      open={open}
      onClose={onClose}
      width={672}
      footer={null}
      destroyOnClose
      classNames={{ content: 'ap-modal-content--chat' }}
      title={
        <div className="min-w-0 pr-6">
          <p className="truncate font-display text-2xl">{title}</p>
          {isRun ? <p className="mt-1 text-xs text-[var(--teal)]">Working</p> : null}
        </div>
      }
    >
      <ConfigProvider locale={zhCN} theme={apWebAntdTheme}>
        <App>
          <div className="ap-task-chat-session flex min-h-0 flex-1 flex-col">
            <ChatSessionView
              isLoading={false}
              isEmpty={false}
              messages={messages}
              liveEvents={transcript?.liveEvents ?? []}
              isRun={isRun}
              runStats={transcript?.runStats}
              sessionKey={fileName}
              onStopRun={onStop}
              onEditResend={onEditResend}
              onOpenExternal={async (href) => {
                window.open(href, '_blank', 'noopener,noreferrer')
                return { ok: true }
              }}
              composer={{
                value: chatInput,
                onChange: (value) => onChatInputChange(value),
                onSend,
                placeholder: '输入消息，Enter 发送，Shift+Enter 换行',
                canSend: !isRun && chatInput.trim().length > 0,
                sendDisabled: sendDisabled || isRun,
                composerMode: 'build',
                onComposerModeChange: () => {
                  /* 任务对话固定 build 模式 */
                }
              }}
            />
          </div>
        </App>
      </ConfigProvider>
    </ApModal>
  )
}
