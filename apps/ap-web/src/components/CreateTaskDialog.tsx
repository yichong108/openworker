'use client'

import { useEffect, useState } from 'react'

import { ApInput } from '@/components/antd/ApInput'
import { ApModal } from '@/components/antd/ApModal'
import { ApPriorityTags } from '@/components/antd/ApPriorityTags'
import { ApStatusRadio } from '@/components/antd/ApStatusRadio'
import { ApTextArea } from '@/components/antd/ApTextArea'
import { columnAccent } from '@/lib/task-column-style'
import type { TaskColumn, TaskPriority } from '@/lib/task-types'

export { columnAccent }

type CreateTaskDialogProps = {
  open: boolean
  column: TaskColumn
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (input: {
    title: string
    priority: TaskPriority
    requirements: string
    status: TaskColumn
  }) => void
}

/**
 * 新建任务对话框。创建后写入所选状态对应目录。
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
  const [status, setStatus] = useState<TaskColumn>(column)
  const [requirementsError, setRequirementsError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setPriority('P1')
      setStatus(column)
      setRequirementsError(null)
    }
  }, [open, column])

  return (
    <ApModal
      open={open}
      onClose={onClose}
      title="新建任务"
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
          if (!requirements) {
            setRequirementsError('请填写事项')
            return
          }
          setRequirementsError(null)
          onSubmit({ title, priority, requirements, status })
        }}
      >
        <label className="block text-sm font-medium">
          <span className="flex items-center gap-1.5">
            事项
            <span className="font-display text-base leading-none text-[var(--rust)]" aria-hidden>
              *
            </span>
            <span className="text-[11px] font-normal text-[var(--ink-soft)]">必填</span>
          </span>
          <ApTextArea
            name="requirements"
            autoFocus
            rows={5}
            className="mt-1 resize-y"
            placeholder="做点什么..."
            onChange={() => setRequirementsError(null)}
          />
        </label>
        {requirementsError ? (
          <p className="mt-1 text-sm text-[var(--rust)]">{requirementsError}</p>
        ) : null}

        <label className="mt-4 block text-sm font-medium">
          名称
          <ApInput name="title" className="mt-1" placeholder="非必填，稍后由 AI 根据事项生成" />
        </label>

        <div className="mt-4 block text-sm font-medium">
          <span id="create-task-status-label">状态</span>
          <ApStatusRadio
            aria-labelledby="create-task-status-label"
            value={status}
            onChange={setStatus}
            disabled={busy}
            className="mt-1"
          />
        </div>

        <div className="mt-4 block text-sm font-medium">
          <span id="create-task-priority-label">优先级</span>
          <ApPriorityTags
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
