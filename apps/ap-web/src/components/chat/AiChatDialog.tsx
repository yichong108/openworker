'use client'

import type { ReactNode } from 'react'

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
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        aria-label="关闭对话"
        onClick={onClose}
      />
      <section className="relative flex max-h-[min(40rem,88vh)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-[var(--paper)] text-[var(--ink)] shadow-lift">
        <header className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
          <div className="min-w-0">
            <p className="truncate font-display text-2xl">{title}</p>
            {running ? <p className="mt-1 text-xs text-[var(--teal)]">正在回复</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerExtra}
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-sm text-[var(--ink-soft)] hover:bg-black/5"
              onClick={onClose}
            >
              关闭
            </button>
          </div>
        </header>
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
      </section>
    </div>
  )
}
