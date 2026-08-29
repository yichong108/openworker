'use client'

import { useCallback, useState } from 'react'

import { ApTextArea } from '@/components/antd/ApTextArea'
import { request } from '@/lib/request'
import type { TaskColumn, TaskDetail } from '@/lib/task-types'

type QuickCreateTodoProps = {
  onCreated?: () => void | Promise<void>
  onMove?: (id: string, status: TaskColumn) => void | Promise<void>
}

/**
 * 是否为 Apple 平台，用于快捷键文案（⌘ vs Ctrl）。
 */
function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
}

/**
 * 生成创建/执行按钮的快捷键提示文案。
 */
function shortcutLabel(options?: { shift?: boolean }): string {
  const mac = isApplePlatform()
  if (mac) {
    return options?.shift ? '⌘⇧↵' : '⌘↵'
  }
  return options?.shift ? 'Ctrl+Shift+Enter' : 'Ctrl+Enter'
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
 * 待办列顶部快捷创建：textarea + 创建 / 开始执行。
 */
export function QuickCreateTodo({ onCreated, onMove }: QuickCreateTodoProps) {
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

  const createTask = useCallback(async (trimmed: string): Promise<TaskDetail | null> => {
    const response = await request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: trimmed, status: 'todo' })
    })
    const payload = (await response.json()) as TaskDetail & { error?: string }
    if (!response.ok) {
      setError(readErrorMessage(payload, '创建失败'))
      return null
    }
    return payload
  }, [])

  const submit = useCallback(async () => {
    const trimmed = description.trim()
    if (!trimmed) {
      setValidationError('请填写描述')
      return
    }

    setBusy(true)
    setError(null)
    setValidationError(null)
    try {
      const task = await createTask(trimmed)
      if (!task) return
      setDescription('')
      await onCreated?.()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '创建失败')
    } finally {
      setBusy(false)
    }
  }, [createTask, description, onCreated])

  const submitAndRun = useCallback(async () => {
    const trimmed = description.trim()
    if (!trimmed) {
      setValidationError('请填写描述')
      return
    }

    setBusy(true)
    setError(null)
    setValidationError(null)
    try {
      const task = await createTask(trimmed)
      if (!task) return
      setDescription('')
      if (onMove) {
        await onMove(task.id, 'doing')
      } else {
        await onCreated?.()
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '开始执行失败')
    } finally {
      setBusy(false)
    }
  }, [createTask, description, onCreated, onMove])

  const canSubmit = description.trim().length > 0 && !busy

  return (
    <div className="mb-3 mr-2 rounded-xl bg-[var(--paper)] px-3 py-3 text-[var(--ink)] shadow-card">
      <ApTextArea
        value={description}
        onChange={(value) => {
          setDescription(value)
          setValidationError(null)
          setError(null)
        }}
        rows={5}
        className="resize-y text-[13px]"
        placeholder="做点什么..."
        disabled={busy}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey) || !canSubmit) return
          event.preventDefault()
          if (event.shiftKey) {
            void submitAndRun()
          } else {
            void submit()
          }
        }}
      />
      {validationError ? (
        <p className="mt-1 text-sm text-[var(--rust)]">{validationError}</p>
      ) : null}
      {error ? <p className="mt-1 text-sm text-[var(--rust)]">{error}</p> : null}
      <div className="mt-2 flex justify-start gap-2">
        <button
          type="button"
          title={`创建 (${shortcutLabel()})`}
          className="rounded-md bg-[var(--ink)] px-2.5 py-1 text-[11px] text-[var(--paper)] disabled:cursor-not-allowed disabled:bg-[var(--ink-soft)] disabled:opacity-25"
          disabled={!canSubmit}
          onClick={() => void submit()}
        >
          {busy ? '创建中…' : '创建'}
        </button>
        <button
          type="button"
          title={`开始执行 (${shortcutLabel({ shift: true })})`}
          className="rounded-md bg-[var(--teal)] px-2.5 py-1 text-[11px] text-white disabled:cursor-not-allowed disabled:opacity-25"
          disabled={!canSubmit}
          onClick={() => void submitAndRun()}
        >
          {busy ? '执行中…' : '开始执行'}
        </button>
      </div>
    </div>
  )
}
