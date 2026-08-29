'use client'

import { useEffect, useState } from 'react'

import type { TaskColumn, TaskDetail, TaskPriority, TaskSummary } from '@/lib/task-types'
import { COLUMN_LABELS } from '@/lib/task-types'

import { ApInput } from '@/components/antd/ApInput'
import { ApPriorityRadio } from '@/components/antd/ApPriorityRadio'
import { ApTextArea } from '@/components/antd/ApTextArea'
import { PRIORITY_BADGE_CLASS } from '@/lib/task-priority-style'

import type { TaskChatHint } from './chat/chat-types'
import { columnAccent } from '@/lib/task-column-style'

type TaskCardProps = {
  task: TaskSummary
  expanded: boolean
  detail: TaskDetail | undefined
  loading: boolean
  error: string | null
  saving: boolean
  chat: TaskChatHint
  onToggle: () => void
  onCollapse: () => void
  onMove: (status: TaskColumn) => void
  onOpenChat: () => void
  onUpdate: (input: {
    title: string
    priority: TaskPriority
    humanNotes: string
  }) => Promise<boolean>
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

/**
 * 单张任务卡片：折叠显示标题；右键编辑或删除；展开后可查看或编辑详情。
 */
export function TaskCard({
  task,
  expanded,
  detail,
  loading,
  error,
  saving,
  chat,
  onToggle,
  onCollapse,
  onMove,
  onOpenChat,
  onUpdate,
  onDelete
}: TaskCardProps) {
  const [editing, setEditing] = useState(false)
  const [pendingEdit, setPendingEdit] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [priority, setPriority] = useState<TaskPriority>(task.priority)
  const [humanNotes, setHumanNotes] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!expanded) {
      setEditing(false)
      setPendingEdit(false)
    }
  }, [expanded])

  useEffect(() => {
    if (!detail || editing) return
    setTitle(detail.title)
    setPriority(detail.priority)
    setHumanNotes(detail.humanNotes)
  }, [detail, editing])

  useEffect(() => {
    if (!pendingEdit || loading || !detail) return
    setTitle(detail.title)
    setPriority(detail.priority)
    setHumanNotes(detail.humanNotes)
    setEditing(true)
    setPendingEdit(false)
  }, [pendingEdit, loading, detail])

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

  const startEdit = () => {
    if (!detail) return
    setTitle(detail.title)
    setPriority(detail.priority)
    setHumanNotes(detail.humanNotes)
    setEditing(true)
  }

  const requestEdit = () => {
    setContextMenu(null)
    if (!expanded) onToggle()
    if (detail && !loading) {
      startEdit()
      return
    }
    setPendingEdit(true)
  }

  const updatedAtLabel = formatUpdatedAt(task.updatedAt)

  return (
    <article
      draggable={!expanded}
      onDragStart={(event) => {
        if ((event.target as HTMLElement).closest('[data-chat-trigger], [data-run-trigger]')) {
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
      className={`rounded-xl bg-[var(--paper)] text-[var(--ink)] shadow-card transition-shadow ${
        expanded ? 'shadow-lift' : 'hover:shadow-lift'
      }`}
    >
      <div className="flex items-start">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-3 px-3 py-3 text-left"
          onClick={() => {
            if (editing) return
            onToggle()
          }}
        >
          <span
            className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide ${PRIORITY_CLASS[task.priority]}`}
          >
            {task.priority}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block break-words font-medium leading-snug">{task.title}</span>
            {updatedAtLabel ? (
              <time
                dateTime={task.updatedAt}
                className="mt-0.5 block text-[11px] font-normal text-[var(--ink-soft)] opacity-45"
              >
                {updatedAtLabel}
              </time>
            ) : null}
          </span>
        </button>
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

      {expanded ? (
        <div className="border-t border-black/10 px-3 pb-3 pt-2">
          {loading ? <p className="text-sm text-[var(--ink-soft)]">加载详情…</p> : null}
          {error ? <p className="text-sm text-[var(--rust)]">{error}</p> : null}
          {detail && !loading && editing ? (
            <form
              className="space-y-3 text-sm"
              onSubmit={(event) => {
                event.preventDefault()
                const notes = humanNotes.trim()
                if (!notes) return
                void onUpdate({
                  title: title.trim(),
                  priority,
                  humanNotes: notes
                }).then((ok) => {
                  if (ok) setEditing(false)
                })
              }}
            >
              <label className="block font-medium">
                <span className="flex items-center gap-1.5">
                  备注
                  <span
                    className="font-display text-base leading-none text-[var(--rust)]"
                    aria-hidden
                  >
                    *
                  </span>
                  <span className="text-[11px] font-normal text-[var(--ink-soft)]">必填</span>
                </span>
                <ApTextArea
                  value={humanNotes}
                  onChange={setHumanNotes}
                  required
                  autoFocus
                  rows={5}
                  className="mt-1 resize-y text-[13px]"
                  placeholder="要做什么"
                />
              </label>
              <label className="block font-medium">
                名称
                <ApInput
                  value={title}
                  onChange={setTitle}
                  className="mt-1 text-[13px]"
                  placeholder="非必填，留空则保留原名称"
                />
              </label>
              <div className="block font-medium">
                <span id={`task-priority-label-${task.id}`}>优先级</span>
                <ApPriorityRadio
                  aria-labelledby={`task-priority-label-${task.id}`}
                  value={priority}
                  onChange={setPriority}
                  disabled={saving}
                  className="mt-1"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-[11px] text-[var(--ink-soft)] hover:bg-black/5"
                  disabled={saving}
                  onClick={() => setEditing(false)}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-[var(--ink)] px-3 py-1 text-[11px] text-[var(--paper)] disabled:opacity-60"
                  disabled={saving}
                >
                  {saving ? '保存中…' : '保存'}
                </button>
              </div>
            </form>
          ) : null}
          {detail && !loading && !editing ? (
            <div className="space-y-3 text-sm leading-6">
              <DetailBlock title="Human Notes" body={detail.humanNotes || '（空）'} />
              <DetailBlock title="Agent Notes" body={detail.agentNotes || '（空）'} />
            </div>
          ) : null}

          {!editing ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                className="text-[11px] text-[var(--ink-soft)] underline-offset-2 hover:underline disabled:opacity-40"
                disabled={!detail || loading}
                onClick={startEdit}
              >
                编辑
              </button>
              <button
                type="button"
                className="ml-auto text-[11px] text-[var(--ink-soft)] underline-offset-2 hover:underline"
                onClick={onCollapse}
              >
                收起
              </button>
            </div>
          ) : null}

          <div className="mt-3 border-t border-black/10 pt-3">
            <p className="truncate font-mono text-[11px] text-[var(--ink-soft)]">{task.fileName}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(['todo', 'doing', 'done', 'blocked'] as TaskColumn[]).map((column) => (
                <button
                  key={column}
                  type="button"
                  disabled={column === task.status || editing}
                  onClick={() => onMove(column)}
                  className="rounded-md px-2 py-1 text-[11px] disabled:opacity-40"
                  style={{
                    background: column === task.status ? columnAccent(column) : 'rgba(0,0,0,0.06)',
                    color: column === task.status ? '#fff' : 'var(--ink-soft)'
                  }}
                >
                  {COLUMN_LABELS[column]}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

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
            onClick={requestEdit}
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

function DetailBlock({ title, body }: { title: string; body: string }) {
  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
        {title}
      </h3>
      <pre className="mt-1 whitespace-pre-wrap break-words font-body text-[13px] text-[var(--ink)]">
        {body}
      </pre>
    </section>
  )
}
