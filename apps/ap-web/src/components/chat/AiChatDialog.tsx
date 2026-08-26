'use client'

import type { ReactNode } from 'react'

import { ApModal } from '@/components/antd/ApModal'

import { ChatComposer } from './ChatComposer'
import { ChatMessageList } from './ChatMessageList'
import type { ChatComposerState, ChatMessage } from './chat-types'

type AiChatDialogProps = {
  open: boolean
  title: string
  messages: ChatMessage[]
  onClose: () => void
  running?: boolean
  composer?: ChatComposerState | null
  headerExtra?: ReactNode
  footer?: ReactNode
  emptyHint?: string
}

/**
 * 通用 AI 对话弹窗：遮罩、标题、消息列表、可选输入区。
 */
export function AiChatDialog({
  open,
  title,
  messages,
  onClose,
  running,
  composer = null,
  headerExtra,
  footer,
  emptyHint
}: AiChatDialogProps) {
  return (
    <ApModal
      open={open}
      onClose={onClose}
      width={672}
      footer={null}
      destroyOnClose
      classNames={{ content: 'ap-modal-content--chat max-h-[min(40rem,88vh)] !flex !flex-col' }}
      title={
        <div className="flex min-w-0 items-start justify-between gap-3 pr-6">
          <div className="min-w-0">
            <p className="truncate font-display text-2xl">{title}</p>
            {running ? <p className="mt-1 text-xs text-[var(--teal)]">正在回复</p> : null}
          </div>
          {headerExtra ? (
            <div className="flex shrink-0 items-center gap-2">{headerExtra}</div>
          ) : null}
        </div>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <ChatMessageList messages={messages} emptyHint={emptyHint} />
      </div>
      {footer}
      {composer ? (
        <ChatComposer
          value={composer.value}
          onChange={composer.onChange}
          onSubmit={composer.onSubmit}
          disabled={composer.disabled}
          placeholder={composer.placeholder}
        />
      ) : null}
    </ApModal>
  )
}
