'use client'

import { useEffect, useState } from 'react'

import type { TaskColumn, TaskDetail, TaskPriority, TaskSummary } from '@/lib/task-types'
import { COLUMN_LABELS } from '@/lib/task-types'

import { ApInput } from '@/components/antd/ApInput'
import { ApSelect } from '@/components/antd/ApSelect'
import { ApTextArea } from '@/components/antd/ApTextArea'

import { columnAccent } from './CreateTaskDialog'

type TaskChatHint = {
  running: boolean
  started: boolean
  error?: string
  preview: string
}

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
    requirements: string
  }) => Promise<boolean>
}

const PRIORITY_CLASS: Record<string, string> = {
  P0: 'bg-[var(--rust)] text-white',
  P1: 'bg-[var(--brass)] text-[var(--ink)]',
  P2: 'bg-[var(--teal)] text-white',
  P3: 'bg-black/15 text-[var(--ink-soft)]'
}

const PRIORITIES: TaskPriority[] = ['P0', 'P1', 'P2', 'P3']

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
 * 卡片底部对话按钮文案。
 *
 * @param chat - 该任务会话状态
 * @returns 按钮文字
 */
function chatButtonLabel(chat: TaskChatHint): string {
  if (!chat.started) return '对话'
  if (chat.running) {
    const preview = chat.preview.replace(/\s+/g, ' ').trim()
    return preview || '…'
  }
  if (chat.error) return chat.error
  return 'Worked'
}

/**
 * 单张任务卡片：折叠显示标题；展开后可查看或编辑详情。
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
  onUpdate
}: TaskCardProps) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [priority, setPriority] = useState<TaskPriority>(task.priority)
  const [requirements, setRequirements] = useState('')

  useEffect(() => {
    if (!expanded) setEditing(false)
  }, [expanded])

  useEffect(() => {
    if (!detail || editing) return
    setTitle(detail.title)
    setPriority(detail.priority)
    setRequirements(detail.requirements)
  }, [detail, editing])

  const startEdit = () => {
    if (!detail) return
    setTitle(detail.title)
    setPriority(detail.priority)
    setRequirements(detail.requirements)
    setEditing(true)
  }

  const updatedAtLabel = formatUpdatedAt(task.updatedAt)

  return (
    <article
      draggable={!expanded}
      onDragStart={(event) => {
        if ((event.target as HTMLElement).closest('[data-chat-trigger]')) {
          event.preventDefault()
          return
        }
        event.dataTransfer.setData('text/plain', task.id)
        event.dataTransfer.effectAllowed = 'move'
      }}
      className={`rounded-xl bg-[var(--paper)] text-[var(--ink)] shadow-card transition-shadow ${
        expanded ? 'shadow-lift' : 'hover:shadow-lift'
      }`}
    >
      <button
        type="button"
        className="flex w-full items-start gap-3 px-3 py-3 text-left"
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

      {expanded ? (
        <div className="border-t border-black/10 px-3 pb-3 pt-2">
          {loading ? <p className="text-sm text-[var(--ink-soft)]">加载详情…</p> : null}
          {error ? <p className="text-sm text-[var(--rust)]">{error}</p> : null}
          {detail && !loading && editing ? (
            <form
              className="space-y-3 text-sm"
              onSubmit={(event) => {
                event.preventDefault()
                const idea = requirements.trim()
                if (!idea) return
                void onUpdate({
                  title: title.trim(),
                  priority,
                  requirements: idea
                }).then((ok) => {
                  if (ok) setEditing(false)
                })
              }}
            >
              <label className="block font-medium">
                <span className="flex items-center gap-1.5">
                  想法
                  <span
                    className="font-display text-base leading-none text-[var(--rust)]"
                    aria-hidden
                  >
                    *
                  </span>
                  <span className="text-[11px] font-normal text-[var(--ink-soft)]">必填</span>
                </span>
                <ApTextArea
                  value={requirements}
                  onChange={setRequirements}
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
                <ApSelect
                  aria-labelledby={`task-priority-label-${task.id}`}
                  value={priority}
                  onChange={(value) => setPriority(value as TaskPriority)}
                  disabled={saving}
                  options={PRIORITIES.map((item) => ({ value: item, label: item }))}
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
              <DetailBlock title="Context" body={detail.context} />
              <DetailBlock title="Requirements" body={detail.requirements} />
              <DetailBlock title="Constraints" body={detail.constraints} />
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

      <div className="px-3 pb-3">
        <button
          type="button"
          data-chat-trigger
          title={chatButtonLabel(chat)}
          onClick={(event) => {
            event.stopPropagation()
            onOpenChat()
          }}
          className={`w-full truncate rounded-lg px-2.5 py-1.5 text-left text-[11px] font-medium transition hover:opacity-90 ${
            chat.running
              ? 'bg-[var(--teal)]/15 text-[var(--teal)]'
              : chat.started && !chat.error
                ? 'bg-[var(--sage)]/20 text-[var(--sage)]'
                : chat.error
                  ? 'bg-[var(--rust)]/15 text-[var(--rust)]'
                  : 'bg-black/5 text-[var(--ink-soft)]'
          }`}
        >
          {chatButtonLabel(chat)}
        </button>
      </div>
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
