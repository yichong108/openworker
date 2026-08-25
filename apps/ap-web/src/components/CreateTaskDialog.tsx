'use client'

import type { TaskColumn, TaskPriority } from '@/lib/task-types'

type CreateTaskDialogProps = {
  open: boolean
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (input: { title: string; priority: TaskPriority; requirements: string }) => void
}

const PRIORITIES: TaskPriority[] = ['P0', 'P1', 'P2', 'P3']

const FIELD =
  'mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 outline-none ring-[var(--brass)] focus:ring-2'

/**
 * 新建任务对话框。创建后始终写入 todo/。
 */
export function CreateTaskDialog({ open, busy, error, onClose, onSubmit }: CreateTaskDialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        aria-label="关闭新建对话框"
        onClick={onClose}
      />
      <form
        className="relative w-full max-w-lg rounded-2xl bg-[var(--paper)] p-6 text-[var(--ink)] shadow-lift"
        onSubmit={(event) => {
          event.preventDefault()
          const form = event.currentTarget
          const data = new FormData(form)
          const title = String(data.get('title') ?? '').trim()
          const priority = String(data.get('priority') ?? 'P1') as TaskPriority
          const requirements = String(data.get('requirements') ?? '').trim()
          if (!requirements) return
          onSubmit({ title, priority, requirements })
        }}
      >
        <p className="font-display text-2xl">新建任务</p>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">写入 todo/，文件名按时间戳生成。</p>

        <label className="mt-5 block text-sm font-medium">
          <span className="flex items-center gap-1.5">
            想法
            <span className="font-display text-base leading-none text-[var(--rust)]" aria-hidden>
              *
            </span>
            <span className="text-[11px] font-normal text-[var(--ink-soft)]">必填</span>
          </span>
          <textarea
            name="requirements"
            required
            autoFocus
            rows={5}
            className={`${FIELD} resize-y`}
            placeholder="要做什么"
          />
        </label>

        <label className="mt-4 block text-sm font-medium">
          名称
          <input name="title" className={FIELD} placeholder="非必填，默认AI根据想法自动生成" />
        </label>

        <label className="mt-4 block text-sm font-medium">
          优先级
          <select name="priority" defaultValue="P1" className={FIELD}>
            {PRIORITIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        {error ? <p className="mt-3 text-sm text-[var(--rust)]">{error}</p> : null}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="rounded-lg px-4 py-2 text-sm text-[var(--ink-soft)] hover:bg-black/5"
            onClick={onClose}
            disabled={busy}
          >
            取消
          </button>
          <button
            type="submit"
            className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-[var(--paper)] disabled:opacity-60"
            disabled={busy}
          >
            {busy ? '创建中…' : '创建'}
          </button>
        </div>
      </form>
    </div>
  )
}

/**
 * 列强调色，用于列头色条。
 *
 * @param column - 任务列
 * @returns CSS 颜色
 */
export function columnAccent(column: TaskColumn): string {
  if (column === 'todo') return 'var(--brass)'
  if (column === 'doing') return 'var(--teal)'
  if (column === 'done') return 'var(--sage)'
  return 'var(--rust)'
}
