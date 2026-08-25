'use client'

import { useEffect, useRef } from 'react'

import type { ChatMessage } from './chat-types'

type ChatMessageListProps = {
  messages: ChatMessage[]
  emptyHint?: string
}

/**
 * 对话气泡列表：自动滚到底，支持流式光标。
 */
export function ChatMessageList({ messages, emptyHint = '还没有消息' }: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  if (messages.length === 0) {
    return <p className="px-1 py-10 text-center text-sm text-[var(--ink-soft)]">{emptyHint}</p>
  }

  return (
    <div className="flex flex-col gap-2.5">
      {messages.map((message) => (
        <article
          key={message.id}
          className={
            message.role === 'assistant'
              ? 'max-w-[92%] self-start rounded-2xl rounded-tl-md bg-black/5 px-3 py-2 text-sm leading-6'
              : message.role === 'user'
                ? 'max-w-[92%] self-end rounded-2xl rounded-tr-md bg-[var(--ink)] px-3 py-2 text-sm leading-6 text-[var(--paper)]'
                : 'self-stretch text-[11px] leading-5 text-[var(--ink-soft)]'
          }
        >
          <p className="whitespace-pre-wrap break-words">
            {message.content}
            {message.streaming ? (
              <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-[var(--brass)] align-middle" />
            ) : null}
          </p>
        </article>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
