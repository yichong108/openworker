'use client'

import { useCallback, useState } from 'react'

import { ApTextArea } from '@/components/antd/ApTextArea'

type QuickCreateTodoProps = {
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
 * 待办列顶部快捷创建：仅 textarea + 创建按钮。
 */
export function QuickCreateTodo({ onCreated }: QuickCreateTodoProps) {
  const [requirements, setRequirements] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

  const submit = useCallback(async () => {
    const trimmed = requirements.trim()
    if (!trimmed) {
      setValidationError('请填写事项')
      return
    }

    setBusy(true)
    setError(null)
    setValidationError(null)
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requirements: trimmed, status: 'todo' })
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok) {
        setError(readErrorMessage(payload, '创建失败'))
        return
      }
      setRequirements('')
      await onCreated?.()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '创建失败')
    } finally {
      setBusy(false)
    }
  }, [requirements, onCreated])

  const canSubmit = requirements.trim().length > 0 && !busy

  return (
    <div className="mb-3 mr-2 rounded-xl bg-[var(--paper)] px-3 py-3 text-[var(--ink)] shadow-card">
      <ApTextArea
        value={requirements}
        onChange={(value) => {
          setRequirements(value)
          setValidationError(null)
          setError(null)
        }}
        rows={3}
        className="resize-y text-[13px]"
        placeholder="做点什么..."
        disabled={busy}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && canSubmit) {
            event.preventDefault()
            void submit()
          }
        }}
      />
      {validationError ? (
        <p className="mt-1 text-sm text-[var(--rust)]">{validationError}</p>
      ) : null}
      {error ? <p className="mt-1 text-sm text-[var(--rust)]">{error}</p> : null}
      <div className="mt-2 flex justify-start">
        <button
          type="button"
          className="rounded-md bg-[var(--ink)] px-2.5 py-1 text-[11px] text-[var(--paper)] disabled:cursor-not-allowed disabled:bg-[var(--ink-soft)] disabled:opacity-25"
          disabled={!canSubmit}
          onClick={() => void submit()}
        >
          {busy ? '创建中…' : '创建'}
        </button>
      </div>
    </div>
  )
}
