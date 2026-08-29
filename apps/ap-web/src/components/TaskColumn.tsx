'use client'

import type { TaskColumn, TaskSummary } from '@/lib/task-types'
import { COLUMN_LABELS } from '@/lib/task-types'

import type { TaskChatHint } from './chat/chat-types'
import { columnAccent } from '@/lib/task-column-style'
import { CreateTaskAction } from './CreateTaskAction'
import { QuickCreateTodo } from './QuickCreateTodo'
import { TaskCard } from './TaskCard'

type TaskColumnProps = {
  column: TaskColumn
  tasks: TaskSummary[]
  chatHints: Record<string, TaskChatHint>
  onEdit: (task: TaskSummary) => void
  onMove: (id: string, status: TaskColumn) => void
  onDropTask: (id: string, status: TaskColumn) => void
  onOpenChat: (task: TaskSummary) => void
  onDelete: (id: string) => void
  onTaskCreated?: () => void | Promise<void>
}

/**
 * 看板单列：作为拖放目标。
 */
export function TaskColumnView({
  column,
  tasks,
  chatHints,
  onEdit,
  onMove,
  onDropTask,
  onOpenChat,
  onDelete,
  onTaskCreated
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
        {onTaskCreated ? <CreateTaskAction column={column} onCreated={onTaskCreated} /> : null}
      </header>

      {column === 'todo' && onTaskCreated ? (
        <QuickCreateTodo onCreated={onTaskCreated} onMove={onMove} />
      ) : null}

      <div className="column-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {tasks.length === 0 ? (
          <p className="px-1 py-8 text-center text-sm text-[var(--mist)]">暂无任务</p>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              chat={chatHints[task.fileName] ?? { running: false, started: false, preview: '' }}
              onEdit={() => onEdit(task)}
              onMove={(status) => onMove(task.id, status)}
              onOpenChat={() => onOpenChat(task)}
              onDelete={() => onDelete(task.id)}
            />
          ))
        )}
      </div>
    </section>
  )
}
