'use client'

import type { TaskColumn, TaskDetail, TaskSummary } from '@/lib/task-types'
import { COLUMN_LABELS } from '@/lib/task-types'

import { columnAccent } from './CreateTaskDialog'

type TaskCardProps = {
  task: TaskSummary
  expanded: boolean
  detail: TaskDetail | undefined
  loading: boolean
  error: string | null
  onToggle: () => void
  onCollapse: () => void
  onMove: (status: TaskColumn) => void
}

const PRIORITY_CLASS: Record<string, string> = {
  P0: 'bg-[var(--rust)] text-white',
  P1: 'bg-[var(--brass)] text-[var(--ink)]',
  P2: 'bg-[var(--teal)] text-white',
  P3: 'bg-black/15 text-[var(--ink-soft)]'
}

/**
 * 单张任务卡片：折叠显示标题；展开后在列内拉高并展示详情。
 */
export function TaskCard({
  task,
  expanded,
  detail,
  loading,
  error,
  onToggle,
  onCollapse,
  onMove
}: TaskCardProps) {
  return (
    <article
      draggable={!expanded}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', task.id)
        event.dataTransfer.effectAllowed = 'move'
      }}
      className={`rounded-xl bg-[var(--paper)] text-[var(--ink)] shadow-card transition ${
        expanded ? 'shadow-lift' : 'hover:-translate-y-0.5'
      }`}
    >
      <button
        type="button"
        className="flex w-full items-start gap-3 px-3 py-3 text-left"
        onClick={onToggle}
      >
        <span
          className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide ${PRIORITY_CLASS[task.priority]}`}
        >
          {task.priority}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words font-medium leading-snug">{task.title}</span>
          <span className="mt-1 block truncate font-mono text-[11px] text-[var(--ink-soft)]">
            {task.fileName}
          </span>
          {!expanded && task.excerpt ? (
            <span className="mt-1 block text-xs leading-5 text-[var(--ink-soft)]">
              {task.excerpt}
            </span>
          ) : null}
        </span>
      </button>

      {expanded ? (
        <div className="border-t border-black/10 px-3 pb-3 pt-2">
          {loading ? <p className="text-sm text-[var(--ink-soft)]">加载详情…</p> : null}
          {error ? <p className="text-sm text-[var(--rust)]">{error}</p> : null}
          {detail && !loading ? (
            <div className="space-y-3 text-sm leading-6">
              <DetailBlock title="Context" body={detail.context} />
              <DetailBlock title="Requirements" body={detail.requirements} />
              <DetailBlock title="Constraints" body={detail.constraints} />
              <DetailBlock title="Agent Notes" body={detail.agentNotes || '（空）'} />
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-1.5">
            {(['todo', 'doing', 'done', 'blocked'] as TaskColumn[]).map((column) => (
              <button
                key={column}
                type="button"
                disabled={column === task.status}
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
            <button
              type="button"
              className="ml-auto text-[11px] text-[var(--ink-soft)] underline-offset-2 hover:underline"
              onClick={onCollapse}
            >
              收起
            </button>
          </div>
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
