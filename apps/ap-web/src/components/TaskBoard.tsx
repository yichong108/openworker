'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { taskApiPath } from '@/lib/task-paths'
import type { TaskBoardPayload, TaskColumn, TaskDetail, TaskPriority } from '@/lib/task-types'
import { TASK_COLUMNS } from '@/lib/task-types'

import { CreateTaskDialog } from './CreateTaskDialog'
import { TaskColumnView } from './TaskColumn'
import { ToolsColumn } from './ToolsColumn'

type ExpandedMap = Record<TaskColumn, string | null>

const EMPTY_EXPANDED: ExpandedMap = {
  todo: null,
  doing: null,
  done: null,
  blocked: null
}

/**
 * 从接口 JSON 中取出 error 字段，否则返回回退文案。
 *
 * @param payload - 解析后的响应
 * @param fallback - 回退错误
 * @returns 错误信息
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
 * 五列任务看板：拉取列表、列内展开详情、拖拽或按钮改状态、新建任务。
 */
export function TaskBoard() {
  const [board, setBoard] = useState<TaskBoardPayload | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<ExpandedMap>(EMPTY_EXPANDED)
  const [details, setDetails] = useState<Record<string, TaskDetail>>({})
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<Record<string, string>>({})
  const [dialogOpen, setDialogOpen] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const detailsRef = useRef(details)
  detailsRef.current = details

  const refresh = useCallback(async () => {
    const response = await fetch('/api/tasks', { cache: 'no-store' })
    const payload = (await response.json()) as TaskBoardPayload & { error?: string }
    if (!response.ok) {
      throw new Error(payload.error || '无法读取任务')
    }
    setBoard(payload)
  }, [])

  useEffect(() => {
    refresh().catch((error: unknown) => {
      setLoadError(error instanceof Error ? error.message : '无法读取任务')
    })
  }, [refresh])

  const fetchDetail = useCallback(async (id: string) => {
    setLoadingId(id)
    setDetailError((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
    try {
      const response = await fetch(taskApiPath(id), { cache: 'no-store' })
      const payload = (await response.json()) as TaskDetail & { error?: string }
      if (!response.ok) {
        throw new Error(payload.error || '无法读取详情')
      }
      setDetails((current) => ({ ...current, [id]: payload }))
    } catch (error) {
      setDetailError((current) => ({
        ...current,
        [id]: error instanceof Error ? error.message : '无法读取详情'
      }))
    } finally {
      setLoadingId(null)
    }
  }, [])

  const toggleCard = useCallback(
    (column: TaskColumn, id: string) => {
      const collapsing = expanded[column] === id
      setExpanded((current) => ({
        ...current,
        [column]: collapsing ? null : id
      }))
      if (!collapsing && !detailsRef.current[id]) {
        void fetchDetail(id)
      }
    },
    [expanded, fetchDetail]
  )

  const collapseColumn = useCallback((column: TaskColumn) => {
    setExpanded((current) => ({ ...current, [column]: null }))
  }, [])

  const moveTask = useCallback(
    async (id: string, status: TaskColumn) => {
      const response = await fetch(taskApiPath(id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok) {
        setLoadError(readErrorMessage(payload, '无法移动任务'))
        return
      }
      setExpanded(EMPTY_EXPANDED)
      setLoadError(null)
      await refresh()
    },
    [refresh]
  )

  const createTask = useCallback(
    async (input: { title: string; priority: TaskPriority; requirements: string }) => {
      setCreateBusy(true)
      setCreateError(null)
      try {
        const response = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input)
        })
        const payload = (await response.json()) as { error?: string }
        if (!response.ok) {
          setCreateError(readErrorMessage(payload, '创建失败'))
          return
        }
        setDialogOpen(false)
        await refresh()
      } catch (error) {
        setCreateError(error instanceof Error ? error.message : '创建失败')
      } finally {
        setCreateBusy(false)
      }
    },
    [refresh]
  )

  return (
    <main className="flex h-screen flex-col overflow-hidden">
      <header className="flex h-16 shrink-0 items-center justify-start gap-3 px-6">
        <button
          type="button"
          onClick={() => {
            setCreateError(null)
            setDialogOpen(true)
          }}
          className="shrink-0 rounded-xl bg-[var(--paper)] px-4 py-2 text-sm font-medium text-[var(--ink)]"
        >
          新建任务
        </button>
        {loadError ? (
          <p className="min-w-0 flex-1 truncate text-sm text-[var(--rust)]">{loadError}</p>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 px-6 pb-6">
        <div className="grid h-full w-full grid-cols-5 gap-3">
          {board
            ? TASK_COLUMNS.map((column) => (
                <TaskColumnView
                  key={column}
                  column={column}
                  tasks={board[column]}
                  expandedId={expanded[column]}
                  details={details}
                  loadingId={loadingId}
                  detailError={detailError}
                  onToggle={toggleCard}
                  onCollapse={collapseColumn}
                  onMove={moveTask}
                  onDropTask={moveTask}
                  onCreate={
                    column === 'todo'
                      ? () => {
                          setCreateError(null)
                          setDialogOpen(true)
                        }
                      : undefined
                  }
                />
              ))
            : TASK_COLUMNS.map((column) => (
                <section
                  key={column}
                  className="rounded-2xl border border-[var(--panel-edge)] bg-[var(--panel)] p-4 text-sm text-[var(--mist)]"
                >
                  加载中…
                </section>
              ))}
          <ToolsColumn />
        </div>
      </div>

      <CreateTaskDialog
        open={dialogOpen}
        busy={createBusy}
        error={createError}
        onClose={() => setDialogOpen(false)}
        onSubmit={createTask}
      />
    </main>
  )
}
