'use client'

import type { TaskColumn, TaskDetail, TaskPriority, TaskSummary } from '@/lib/task-types'
import { COLUMN_LABELS } from '@/lib/task-types'

import { columnAccent } from './CreateTaskDialog'
import { TaskCard } from './TaskCard'

type TaskUpdateInput = {
  title: string
  priority: TaskPriority
  requirements: string
}

type TaskColumnProps = {
  column: TaskColumn
  tasks: TaskSummary[]
  expandedId: string | null
  details: Record<string, TaskDetail>
  loadingId: string | null
  detailError: Record<string, string>
  savingId: string | null
  onToggle: (column: TaskColumn, id: string) => void
  onCollapse: (column: TaskColumn) => void
  onMove: (id: string, status: TaskColumn) => void
  onDropTask: (id: string, status: TaskColumn) => void
  onUpdate: (id: string, input: TaskUpdateInput) => Promise<boolean>
  onCreate?: () => void
}

/**
 * 看板单列：作为拖放目标，同一列只展开一张卡片。
 */
export function TaskColumnView({
  column,
  tasks,
  expandedId,
  details,
  loadingId,
  detailError,
  savingId,
  onToggle,
  onCollapse,
  onMove,
  onDropTask,
  onUpdate,
  onCreate
}: TaskColumnProps) {
  return (
    <section
      className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-[var(--panel-edge)] bg-[var(--panel)] py-3 pl-3 pr-1"
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(event) => {
        event.preventDefault()
        const id = event.dataTransfer.getData('text/plain')
        if (id) onDropTask(id, column)
      }}
    >
      <header className="mb-3 flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: columnAccent(column) }} />
          <h2 className="font-display text-xl tracking-wide">{COLUMN_LABELS[column]}</h2>
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-[var(--mist)]">
            {tasks.length}
          </span>
        </div>
        {onCreate ? (
          <button
            type="button"
            onClick={onCreate}
            className="rounded-lg bg-[var(--brass)] px-2.5 py-1 text-xs font-medium text-[var(--ink)]"
          >
            新建
          </button>
        ) : null}
      </header>

      <div className="column-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {tasks.length === 0 ? (
          <p className="px-1 py-8 text-center text-sm text-[var(--mist)]">暂无任务</p>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              expanded={expandedId === task.id}
              detail={details[task.id]}
              loading={loadingId === task.id}
              error={detailError[task.id] ?? null}
              saving={savingId === task.id}
              onToggle={() => onToggle(column, task.id)}
              onCollapse={() => onCollapse(column)}
              onMove={(status) => onMove(task.id, status)}
              onUpdate={(input) => onUpdate(task.id, input)}
            />
          ))
        )}
      </div>
    </section>
  )
}
