'use client'

import { useEffect, useState } from 'react'

import { ApInput } from '@/components/antd/ApInput'
import { ApModal } from '@/components/antd/ApModal'
import { ApPriorityTags } from '@/components/antd/ApPriorityTags'
import { ApStatusRadio } from '@/components/antd/ApStatusRadio'
import { ApTextArea } from '@/components/antd/ApTextArea'
import type { TaskColumn, TaskDetail, TaskPriority, TaskSummary } from '@/lib/task-types'

type EditTaskDialogProps = {
  open: boolean
  task: TaskSummary | null
  detail: TaskDetail | undefined
  loading: boolean
  loadError: string | null
  busy: boolean
  saveError: string | null
  onClose: () => void
  onSubmit: (input: {
    title: string
    priority: TaskPriority
    description: string
    status: TaskColumn
  }) => void
}

/**
 * 编辑任务对话框。保存时 PATCH 任务字段，状态变更时同步移动目录。
 */
export function EditTaskDialog({
  open,
  task,
  detail,
  loading,
  loadError,
  busy,
  saveError,
  onClose,
  onSubmit
}: EditTaskDialogProps) {
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('P2')
  const [status, setStatus] = useState<TaskColumn>('todo')
  const [description, setDescription] = useState('')
  const [descriptionError, setDescriptionError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !detail) return
    setTitle(detail.title)
    setPriority(detail.priority)
    setStatus(detail.status)
    setDescription(detail.description)
    setDescriptionError(null)
  }, [open, detail])

  return (
    <ApModal
      open={open}
      onClose={onClose}
      title="编辑任务"
      footer={null}
      maskClosable={!busy}
      destroyOnClose
    >
      {loading ? <p className="text-sm text-[var(--ink-soft)]">加载详情…</p> : null}
      {loadError ? <p className="text-sm text-[var(--rust)]">{loadError}</p> : null}
      {!loading && !loadError && detail ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            const notes = description.trim()
            if (!notes) {
              setDescriptionError('请填写描述')
              return
            }
            setDescriptionError(null)
            onSubmit({
              title: title.trim(),
              priority,
              description: notes,
              status
            })
          }}
        >
          <label className="block text-sm font-medium">
            <span className="flex items-center gap-1.5">
              描述
              <span className="font-display text-base leading-none text-[var(--rust)]" aria-hidden>
                *
              </span>
              <span className="text-[11px] font-normal text-[var(--ink-soft)]">必填</span>
            </span>
            <ApTextArea
              value={description}
              onChange={(value) => {
                setDescription(value)
                setDescriptionError(null)
              }}
              autoFocus
              rows={5}
              className="mt-1 resize-y"
              placeholder="要做什么"
            />
          </label>
          {descriptionError ? (
            <p className="mt-1 text-sm text-[var(--rust)]">{descriptionError}</p>
          ) : null}

          <label className="mt-4 block text-sm font-medium">
            名称
            <ApInput
              value={title}
              onChange={setTitle}
              className="mt-1"
              placeholder="非必填，留空则保留原名称"
            />
          </label>

          <div className="mt-4 block text-sm font-medium">
            <span id="edit-task-status-label">状态</span>
            <ApStatusRadio
              aria-labelledby="edit-task-status-label"
              value={status}
              onChange={setStatus}
              disabled={busy}
              className="mt-1"
            />
          </div>

          <div className="mt-4 block text-sm font-medium">
            <span id="edit-task-priority-label">优先级</span>
            <ApPriorityTags
              aria-labelledby="edit-task-priority-label"
              value={priority}
              onChange={setPriority}
              disabled={busy}
              className="mt-1"
            />
          </div>

          {task ? (
            <p className="mt-4 truncate font-mono text-[11px] text-[var(--ink-soft)]">
              {task.fileName}
            </p>
          ) : null}

          {saveError ? <p className="mt-3 text-sm text-[var(--rust)]">{saveError}</p> : null}

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
              {busy ? '保存中…' : '保存'}
            </button>
          </div>
        </form>
      ) : null}
    </ApModal>
  )
}
