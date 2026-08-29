'use client'

import { useEffect, useState } from 'react'

import type { TaskColumn, TaskSummary } from '@/lib/task-types'

import { PRIORITY_BADGE_CLASS } from '@/lib/task-priority-style'

import type { TaskChatHint } from './chat/chat-types'

type TaskCardProps = {
  task: TaskSummary
  chat: TaskChatHint
  onEdit: () => void
  onMove: (status: TaskColumn) => void
  onOpenChat: () => void
  onDelete: () => void
}

const PRIORITY_CLASS = PRIORITY_BADGE_CLASS

/**
 * 把文件 mtime 格式成本地可读时间。
 *
 * @param iso - ISO 8601 时间
 * @returns 如 2026-08-25 22:15；无效则空串
 */
function formatUpdatedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * 卡片底部对话按钮悬停/无障碍文案。
 *
 * @param chat - 该任务会话状态
 * @returns 按钮说明
 */
function chatButtonTitle(chat: TaskChatHint): string {
  if (!chat.started) return '对话'
  if (chat.running) {
    const preview = chat.preview.replace(/\s+/g, ' ').trim()
    return preview || 'Agent 执行中…'
  }
  if (chat.error) return chat.error
  return '对话已完成'
}

function ChatBubbleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7.5 8h9M7.5 12h5.5M6 4h12a2 2 0 012 2v9a2 2 0 01-2 2H9l-4 3V6a2 2 0 012-2z" />
    </svg>
  )
}

function ChatSpinnerIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M12 3a9 9 0 019 9" strokeLinecap="round" />
    </svg>
  )
}

function ChatErrorIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function ChatDoneIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.5l4 4L19 7" />
    </svg>
  )
}

function ChatButtonIcon({ chat }: { chat: TaskChatHint }) {
  if (chat.running) {
    return <ChatSpinnerIcon className="h-3.5 w-3.5 animate-spin" />
  }
  if (chat.error) {
    return <ChatErrorIcon className="h-3.5 w-3.5" />
  }
  if (chat.started) {
    return <ChatDoneIcon className="h-3.5 w-3.5" />
  }
  return <ChatBubbleIcon className="h-3.5 w-3.5" />
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden="true">
      <path d="M8 5.2v13.6c0 .7.8 1.1 1.4.7l10.2-6.8c.6-.4.6-1.2 0-1.6L9.4 4.5C8.8 4.1 8 4.5 8 5.2z" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden="true">
      <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />
    </svg>
  )
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-5" />
      <path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

/**
 * 单张任务卡片
 */
export function TaskCard({ task, chat, onEdit, onMove, onOpenChat, onDelete }: TaskCardProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!contextMenu) return
    const close = (): void => setContextMenu(null)
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    const timer = window.requestAnimationFrame(() => {
      window.addEventListener('click', close)
      window.addEventListener('contextmenu', close)
    })
    window.addEventListener('keydown', onKey)
    return () => {
      window.cancelAnimationFrame(timer)
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [contextMenu])

  const updatedAtLabel = formatUpdatedAt(task.updatedAt)

  return (
    <article
      draggable
      onDragStart={(event) => {
        if (
          (event.target as HTMLElement).closest(
            '[data-chat-trigger], [data-run-trigger], [data-edit-trigger]'
          )
        ) {
          event.preventDefault()
          return
        }
        event.dataTransfer.setData('text/plain', task.id)
        event.dataTransfer.effectAllowed = 'move'
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        const menuWidth = 120
        const menuHeight = 72
        const x = Math.min(event.clientX, window.innerWidth - menuWidth - 8)
        const y = Math.min(event.clientY, window.innerHeight - menuHeight - 8)
        setContextMenu({ x: Math.max(8, x), y: Math.max(8, y) })
      }}
      className="rounded-xl bg-[var(--paper)] text-[var(--ink)] shadow-card transition-shadow hover:shadow-lift"
    >
      <div className="flex items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3 px-3 py-3">
          <span
            className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide ${PRIORITY_CLASS[task.priority]}`}
          >
            {task.priority}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block break-words font-medium leading-snug">{task.title}</span>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              {updatedAtLabel ? (
                <time
                  dateTime={task.updatedAt}
                  className="text-[11px] font-normal text-[var(--ink-soft)] opacity-45"
                >
                  {updatedAtLabel}
                </time>
              ) : (
                <span />
              )}
              <button
                type="button"
                data-edit-trigger
                aria-label="编辑任务"
                title="编辑任务"
                onClick={(event) => {
                  event.stopPropagation()
                  onEdit()
                }}
                className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-[var(--ink-soft)] opacity-45 transition hover:bg-black/5 hover:opacity-80"
              >
                <EditIcon className="h-3 w-3" />
              </button>
            </div>
          </span>
        </div>
        {task.status === 'todo' ? (
          <button
            type="button"
            data-run-trigger
            aria-label="开始执行"
            title="开始执行"
            onClick={(event) => {
              event.stopPropagation()
              onMove('doing')
            }}
            className="mr-2.5 mt-2.5 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--teal)] text-white transition-opacity hover:opacity-90"
          >
            <PlayIcon />
          </button>
        ) : null}
        {task.status === 'doing' ? (
          <button
            type="button"
            data-run-trigger
            aria-label="停止任务"
            title="停止并改为阻塞"
            onClick={(event) => {
              event.stopPropagation()
              onMove('blocked')
            }}
            className="mr-2.5 mt-2.5 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--rust)] text-white transition-opacity hover:opacity-90"
          >
            <StopIcon />
          </button>
        ) : null}
      </div>

      <div className="block px-3 pb-3">
        <button
          type="button"
          data-chat-trigger
          title={chatButtonTitle(chat)}
          aria-label={chatButtonTitle(chat)}
          onClick={(event) => {
            event.stopPropagation()
            onOpenChat()
          }}
          className={`flex w-full items-center rounded-lg px-2.5 py-1.5 transition hover:opacity-90 ${
            chat.running
              ? 'bg-[var(--teal)]/15 text-[var(--teal)]'
              : chat.started && !chat.error
                ? 'bg-[var(--sage)]/20 text-[var(--sage)]'
                : chat.error
                  ? 'bg-[var(--rust)]/15 text-[var(--rust)]'
                  : 'bg-black/5 text-[var(--ink-soft)]'
          }`}
        >
          <span className="flex w-5 shrink-0 items-center justify-start">
            <ChatButtonIcon chat={chat} />
          </span>
          <span className="flex flex-1 justify-center font-mono text-[11px] tracking-wide">
            {chat.running ? 'Working' : chat.started && !chat.error ? 'Worked' : null}
          </span>
          <span className="w-5 shrink-0" aria-hidden="true" />
        </button>
      </div>

      {contextMenu ? (
        <div
          role="menu"
          aria-label="任务操作"
          className="fixed z-[80] min-w-[7.5rem] overflow-hidden rounded-lg border border-black/10 bg-[var(--paper)] py-1 text-sm text-[var(--ink)] shadow-lift"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-1.5 text-left hover:bg-black/5"
            onClick={() => {
              setContextMenu(null)
              onEdit()
            }}
          >
            编辑
          </button>
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-1.5 text-left text-[var(--rust)] hover:bg-black/5"
            onClick={() => {
              setContextMenu(null)
              onDelete()
            }}
          >
            删除
          </button>
        </div>
      ) : null}
    </article>
  )
}
