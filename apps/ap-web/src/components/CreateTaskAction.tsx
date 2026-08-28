'use client'

import { useCallback, useState } from 'react'

import type { TaskColumn, TaskPriority } from '@/lib/task-types'

import { CreateTaskDialog } from './CreateTaskDialog'
import { columnAccent } from '@/lib/task-column-style'

type CreateTaskActionProps = {
  column: TaskColumn
  onCreated?: () => void | Promise<void>
}

/**
 * 从接口 JSON 中取出 error 字段，否则返回回退文案。
 */
function readErrorMessage(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    typeof (payload as { error: unknown }).error === 'string'
  ) {
    return (payload as { error: string }).error
  }
  return fallback
}

/**
 * 列头「新建」按钮与对话框，创建后写入对应列目录。
 */
export function CreateTaskAction({ column, onCreated }: CreateTaskActionProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = useCallback(
    async (input: {
      title: string
      priority: TaskPriority
      humanNotes: string
      status: TaskColumn
    }) => {
      setBusy(true)
      setError(null)
      try {
        const response = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input)
        })
        const payload = (await response.json()) as { error?: string }
        if (!response.ok) {
          setError(readErrorMessage(payload, '创建失败'))
          return
        }
        setOpen(false)
        await onCreated?.()
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : '创建失败')
      } finally {
        setBusy(false)
      }
    },
    [onCreated]
  )

  return (
    <>
      <button
        type="button"
        aria-label="新建任务"
        title="新建任务"
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
        style={{ ['--create-accent' as string]: columnAccent(column) }}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-white/15 text-[var(--mist)] transition hover:border-[var(--create-accent)] hover:bg-[color-mix(in_srgb,var(--create-accent)_12%,transparent)] hover:text-[var(--create-accent)] active:scale-[0.97]"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M12 6v12M6 12h12" />
        </svg>
      </button>
      <CreateTaskDialog
        open={open}
        column={column}
        busy={busy}
        error={error}
        onClose={() => setOpen(false)}
        onSubmit={submit}
      />
    </>
  )
}
