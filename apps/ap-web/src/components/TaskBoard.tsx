'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { request } from '@/lib/request'
import { taskApiPath } from '@/lib/task-paths'
import type { TaskBoardPayload, TaskColumn, TaskDetail, TaskPriority } from '@/lib/task-types'
import { TASK_COLUMNS } from '@/lib/task-types'

import type { ChatTranscript } from './chat/chat-types'
import { AiChatDialog } from './chat/AiChatDialog'
import { ConfigDialog } from './ConfigDialog'
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
 * 五列任务看板：拉取列表、列内展开详情、编辑字段、拖拽或按钮改状态、新建任务。
 */
export function TaskBoard() {
  const [board, setBoard] = useState<TaskBoardPayload | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<ExpandedMap>(EMPTY_EXPANDED)
  const [details, setDetails] = useState<Record<string, TaskDetail>>({})
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<Record<string, string>>({})
  const [configOpen, setConfigOpen] = useState(false)
  const [configAuthError, setConfigAuthError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [transcripts, setTranscripts] = useState<Record<string, ChatTranscript>>({})
  const [chatTask, setChatTask] = useState<{
    id: string
    fileName: string
    title: string
  } | null>(null)
  const detailsRef = useRef(details)
  detailsRef.current = details
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded

  const fetchDetail = useCallback(async (id: string) => {
    setLoadingId(id)
    setDetailError((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
    try {
      const response = await request(taskApiPath(id))
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

  const applyBoard = useCallback(
    (payload: TaskBoardPayload) => {
      setBoard(payload)
      setLoadError(null)
      const current = expandedRef.current
      const next: ExpandedMap = { ...current }
      const toRefetch: string[] = []
      for (const column of TASK_COLUMNS) {
        const id = next[column]
        if (!id) continue
        if (!payload[column].some((task) => task.id === id)) {
          next[column] = null
          continue
        }
        if (detailsRef.current[id]) toRefetch.push(id)
      }
      setExpanded(next)
      for (const id of toRefetch) {
        void fetchDetail(id)
      }
    },
    [fetchDetail]
  )

  const refresh = useCallback(async () => {
    const response = await request('/api/tasks')
    const payload = (await response.json()) as TaskBoardPayload & {
      error?: string
    }
    if (!response.ok) {
      throw new Error(payload.error || '无法读取任务')
    }
    applyBoard(payload)
  }, [applyBoard])

  useEffect(() => {
    refresh().catch((error: unknown) => {
      setLoadError(error instanceof Error ? error.message : '无法读取任务')
    })
  }, [refresh])

  useEffect(() => {
    const source = new EventSource('/api/tasks/stream')
    const onTasks = (event: MessageEvent<string>) => {
      try {
        applyBoard(JSON.parse(event.data) as TaskBoardPayload)
      } catch {
        setLoadError('无法解析任务推送')
      }
    }
    const onTasksError = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as { error?: string }
        setLoadError(payload.error || '无法读取任务')
      } catch {
        setLoadError('无法读取任务')
      }
    }
    source.addEventListener('tasks', onTasks)
    source.addEventListener('tasks-error', onTasksError)
    return () => {
      source.removeEventListener('tasks', onTasks)
      source.removeEventListener('tasks-error', onTasksError)
      source.close()
    }
  }, [applyBoard])

  useEffect(() => {
    const source = new EventSource('/api/tasks/chat/stream')
    const onSnapshot = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as {
          transcripts?: Record<string, ChatTranscript>
        }
        setTranscripts(payload.transcripts ?? {})
      } catch {
        /* 忽略单帧解析失败 */
      }
    }
    source.addEventListener('chat-snapshot', onSnapshot)
    return () => {
      source.removeEventListener('chat-snapshot', onSnapshot)
      source.close()
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
      const response = await request(taskApiPath(id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })
      const payload = (await response.json()) as {
        error?: string
        agentError?: string
        code?: string
      }
      if (!response.ok) {
        setLoadError(readErrorMessage(payload, '无法移动任务'))
        return
      }
      setExpanded(EMPTY_EXPANDED)
      if (payload.agentError) {
        setLoadError(payload.agentError)
        if (payload.code === 'ai_auth') {
          setConfigAuthError(payload.agentError)
          setConfigOpen(true)
        }
      } else {
        setLoadError(null)
      }
      await refresh()
    },
    [refresh]
  )

  const updateTask = useCallback(
    async (
      id: string,
      input: { title: string; priority: TaskPriority; humanNotes: string }
    ): Promise<boolean> => {
      setSavingId(id)
      try {
        const response = await request(taskApiPath(id), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input)
        })
        const payload = (await response.json()) as TaskDetail & {
          error?: string
        }
        if (!response.ok) {
          setLoadError(readErrorMessage(payload, '无法保存任务'))
          return false
        }
        setDetails((current) => ({ ...current, [id]: payload }))
        setLoadError(null)
        await refresh()
        return true
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : '无法保存任务')
        return false
      } finally {
        setSavingId(null)
      }
    },
    [refresh]
  )

  const deleteTask = useCallback(
    async (id: string) => {
      try {
        const response = await request(taskApiPath(id), { method: 'DELETE' })
        const payload = (await response.json()) as { error?: string }
        if (!response.ok) {
          setLoadError(readErrorMessage(payload, '无法删除任务'))
          return
        }
        setChatTask((current) => (current?.id === id ? null : current))
        setDetails((current) => {
          const next = { ...current }
          delete next[id]
          return next
        })
        setExpanded((current) => {
          const next = { ...current }
          for (const column of TASK_COLUMNS) {
            if (next[column] === id) next[column] = null
          }
          return next
        })
        setLoadError(null)
        await refresh()
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : '无法删除任务')
      }
    },
    [refresh]
  )

  return (
    <main className="relative h-screen overflow-hidden p-4">
      <button
        type="button"
        aria-label="配置"
        title="配置"
        onClick={() => {
          setConfigAuthError(null)
          setConfigOpen(true)
        }}
        className="absolute right-5 top-5 z-40 flex h-9 w-9 items-center justify-center rounded-lg text-[var(--chrome)] transition hover:bg-white/10 hover:text-[var(--brass)]"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      </button>

      {loadError ? (
        <p className="absolute left-4 top-4 z-40 max-w-sm truncate text-sm text-[var(--rust)]">
          {loadError}
        </p>
      ) : null}

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
                savingId={savingId}
                transcripts={transcripts}
                onToggle={toggleCard}
                onCollapse={collapseColumn}
                onMove={moveTask}
                onDropTask={moveTask}
                onOpenChat={(task) => {
                  queueMicrotask(() => {
                    setChatTask({
                      id: task.id,
                      fileName: task.fileName,
                      title: task.title
                    })
                  })
                }}
                onUpdate={updateTask}
                onDelete={(id) => void deleteTask(id)}
                onTaskCreated={refresh}
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
        <ToolsColumn
          onAiAuthError={(message) => {
            setConfigAuthError(message)
            setConfigOpen(true)
          }}
        />
      </div>

      <ConfigDialog
        open={configOpen}
        authError={configAuthError}
        onClose={() => {
          setConfigOpen(false)
          setConfigAuthError(null)
        }}
      />
      <AiChatDialog
        open={Boolean(chatTask)}
        title={chatTask?.title || '对话'}
        fileName={chatTask?.fileName ?? ''}
        taskId={chatTask?.id ?? ''}
        onClose={() => setChatTask(null)}
        onAiAuthError={(message) => {
          setConfigAuthError(message)
          setConfigOpen(true)
        }}
      />
    </main>
  )
}
