'use client'

import { useEffect, useState } from 'react'

import { ApInput } from '@/components/antd/ApInput'
import { ApModal } from '@/components/antd/ApModal'
import { ApPriorityRadio } from '@/components/antd/ApPriorityRadio'
import { ApTextArea } from '@/components/antd/ApTextArea'
import type { TaskColumn, TaskPriority } from '@/lib/task-types'
import { columnCreateHint } from '@/lib/task-types'

type CreateTaskDialogProps = {
  open: boolean
  column: TaskColumn
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (input: { title: string; priority: TaskPriority; requirements: string }) => void
}

/**
 * 新建任务对话框。创建后写入 column 对应目录。
 */
export function CreateTaskDialog({
  open,
  column,
  busy,
  error,
  onClose,
  onSubmit
}: CreateTaskDialogProps) {
  const [priority, setPriority] = useState<TaskPriority>('P1')

  useEffect(() => {
    if (open) setPriority('P1')
  }, [open])

  return (
    <ApModal
      open={open}
      onClose={onClose}
      title="新建任务"
      subtitle={columnCreateHint(column)}
      footer={null}
      maskClosable={!busy}
      destroyOnClose
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const form = event.currentTarget
          const data = new FormData(form)
          const title = String(data.get('title') ?? '').trim()
          const requirements = String(data.get('requirements') ?? '').trim()
          if (!requirements) return
          onSubmit({ title, priority, requirements })
        }}
      >
        <label className="block text-sm font-medium">
          <span className="flex items-center gap-1.5">
            想法
            <span className="font-display text-base leading-none text-[var(--rust)]" aria-hidden>
              *
            </span>
            <span className="text-[11px] font-normal text-[var(--ink-soft)]">必填</span>
          </span>
          <ApTextArea
            name="requirements"
            required
            autoFocus
            rows={5}
            className="mt-1 resize-y"
            placeholder="要做什么"
          />
        </label>

        <label className="mt-4 block text-sm font-medium">
          名称
          <ApInput name="title" className="mt-1" placeholder="非必填，默认AI根据想法自动生成" />
        </label>

        <div className="mt-4 block text-sm font-medium">
          <span id="create-task-priority-label">优先级</span>
          <ApPriorityRadio
            aria-labelledby="create-task-priority-label"
            value={priority}
            onChange={setPriority}
            disabled={busy}
            className="mt-1"
          />
        </div>

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
    </ApModal>
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
