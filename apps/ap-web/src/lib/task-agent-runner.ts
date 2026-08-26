import {
  EventType,
  randomUUID,
  type BaseEvent,
  type CustomEvent,
  type RunErrorEvent,
  type TextMessageContentEvent,
  type ToolCallStartEvent
} from '@ag-ui/client'
import type { ApAgentWithAGUI } from '@openworker/ap-agent'
import type { Subscription } from 'rxjs'

import type { ChatTranscript } from '@/components/chat/chat-types'
import { createApWebAgent } from './ap-agent-runtime'
import { isAiAuthFailure } from './ai-config'
import { writeTaskChatFile } from './task-chat-fs'
import { TaskFsError } from './task-fs-error'
import type { TaskDetail } from './task-types'
import { getWorkspaceRoot } from './workspace-root'

const TEXT_DELTA_CUSTOM_NAME = 'openworker.text.delta'

type TaskAgentJob = {
  fileName: string
  prompt: string
  agent: ApAgentWithAGUI
  subscription?: Subscription
  cancelled?: boolean
}

const jobs = new Map<string, TaskAgentJob>()
const transcripts = new Map<string, ChatTranscript>()
const streamBuf = new Map<string, string>()
const listeners = new Set<(payload: Record<string, ChatTranscript>) => void>()
let messageSeq = 0

function nextMessageId(): string {
  messageSeq += 1
  return `m${messageSeq}`
}

function emptyTranscript(): ChatTranscript {
  return { running: false, started: false, messages: [] }
}

function getOrCreate(fileName: string): ChatTranscript {
  const current = transcripts.get(fileName)
  if (current) return current
  const created = emptyTranscript()
  transcripts.set(fileName, created)
  return created
}

function notify(): void {
  const payload = Object.fromEntries(transcripts)
  for (const listener of listeners) {
    listener(payload)
  }
}

function patchTranscript(fileName: string, partial: Partial<ChatTranscript>): void {
  const current = getOrCreate(fileName)
  transcripts.set(fileName, {
    ...current,
    ...partial,
    messages: partial.messages ?? current.messages
  })
  notify()
}

/**
 * 根据任务详情拼出只做这一件任务的 prompt。
 *
 * @param task - 任务详情
 * @returns Agent prompt
 */
function buildTaskPrompt(task: TaskDetail): string {
  return [
    '你只执行下面这一件任务，不要领取、移动或改动其它任务文件。',
    `当前任务文件：${task.id}`,
    '',
    `# ${task.title}`,
    '',
    '## Requirements',
    task.requirements.trim() || '（空）',
    '',
    '## Context',
    task.context.trim() || '（空）',
    '',
    '## Constraints',
    task.constraints.trim() || '（空）'
  ].join('\n')
}

function appendAssistantDelta(fileName: string, text: string): void {
  if (!text) return
  const current = getOrCreate(fileName)
  const messages = [...current.messages]
  const last = messages[messages.length - 1]
  if (last?.role === 'assistant' && last.streaming) {
    messages[messages.length - 1] = { ...last, content: last.content + text }
  } else {
    messages.push({
      id: nextMessageId(),
      role: 'assistant',
      content: text,
      streaming: true
    })
  }
  patchTranscript(fileName, { messages, running: true, started: true })
}

function finishAssistant(fileName: string): void {
  const current = getOrCreate(fileName)
  const messages = current.messages.map((item) =>
    item.streaming ? { ...item, streaming: false } : item
  )
  patchTranscript(fileName, { messages })
}

/**
 * 一轮结束后把用户/助手正文写入 chat 文件，不检查任务列。
 *
 * @param fileName - 任务文件名
 * @param prompt - 本轮发给 Agent 的正文
 */
function persistCompletedRound(fileName: string, prompt: string): void {
  try {
    const current = transcripts.get(fileName)
    writeTaskChatFile(fileName, prompt, current?.messages ?? [])
  } catch (error) {
    console.error(
      `[task-chat] 写入失败 ${fileName}:`,
      error instanceof Error ? error.message : error
    )
  }
}

function appendSystem(fileName: string, content: string): void {
  const trimmed = content.replace(/\s+/g, ' ').trim()
  if (!trimmed) return
  const current = getOrCreate(fileName)
  patchTranscript(fileName, {
    running: true,
    started: true,
    messages: [...current.messages, { id: nextMessageId(), role: 'system', content: trimmed }]
  })
}

/**
 * 将 AG-UI 流事件写入会话。
 *
 * @param fileName - 任务文件名
 * @param event - AG-UI BaseEvent
 */
function applyAguiEvent(fileName: string, event: BaseEvent): void {
  if (event.type === EventType.CUSTOM) {
    const custom = event as CustomEvent
    if (custom.name === TEXT_DELTA_CUSTOM_NAME) {
      const delta =
        custom.value &&
        typeof custom.value === 'object' &&
        typeof (custom.value as { delta?: unknown }).delta === 'string'
          ? (custom.value as { delta: string }).delta
          : ''
      if (!delta) return
      const prev = streamBuf.get(fileName) ?? ''
      streamBuf.set(fileName, prev + delta)
      appendAssistantDelta(fileName, delta)
    }
    return
  }

  if (event.type === EventType.TEXT_MESSAGE_CONTENT) {
    const e = event as TextMessageContentEvent
    const prev = streamBuf.get(fileName) ?? ''
    if (prev === e.delta) return
    const next = prev.length > 0 && e.delta.startsWith(prev) ? e.delta.slice(prev.length) : e.delta
    if (next) {
      streamBuf.set(
        fileName,
        prev.length > 0 && e.delta.startsWith(prev) ? e.delta : prev + e.delta
      )
      appendAssistantDelta(fileName, next)
    }
    return
  }

  if (event.type === EventType.TOOL_CALL_START) {
    const e = event as ToolCallStartEvent
    appendSystem(fileName, `工具 start ${e.toolCallName}`)
    finishAssistant(fileName)
    return
  }

  if (event.type === EventType.RUN_ERROR) {
    const e = event as RunErrorEvent
    if (e.code !== 'CANCELLED') {
      patchTranscript(fileName, {
        running: false,
        error: e.message || '执行失败'
      })
    }
    return
  }

  if (event.type === EventType.RUN_FINISHED) {
    patchTranscript(fileName, { running: false, error: undefined })
  }
}

/**
 * 记录启动失败，供卡片按钮显示短错误句。
 *
 * @param fileName - 任务文件名
 * @param message - 错误文案
 */
export function recordTaskAgentError(fileName: string, message: string): void {
  patchTranscript(fileName, {
    running: false,
    started: true,
    error: message
  })
}

/**
 * 当前全部任务会话快照。
 */
export function listTaskChatTranscripts(): Record<string, ChatTranscript> {
  return Object.fromEntries(transcripts)
}

/**
 * 订阅会话变更（SSE 使用）。
 *
 * @param listener - 收到全量 transcripts
 * @returns 取消订阅
 */
export function subscribeTaskChat(
  listener: (payload: Record<string, ChatTranscript>) => void
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * 进入进行中后启动该任务的独立 Agent。已在跑则忽略。
 *
 * @param task - 移动后的任务详情
 */
export async function startTaskAgent(task: TaskDetail): Promise<void> {
  const fileName = task.fileName
  if (jobs.has(fileName)) return

  const workspaceRoot = getWorkspaceRoot()
  const prompt = buildTaskPrompt(task)

  let agent: ApAgentWithAGUI
  try {
    agent = createApWebAgent(workspaceRoot, `task:${fileName}`)
  } catch (error) {
    if (error instanceof TaskFsError || isAiAuthFailure(error)) {
      throw error instanceof TaskFsError
        ? error
        : new TaskFsError(
            `模型鉴权失败：${error instanceof Error ? error.message : '未知错误'}`,
            401,
            'ai_auth'
          )
    }
    throw error
  }

  const job: TaskAgentJob = { fileName, prompt, agent }
  jobs.set(fileName, job)
  streamBuf.set(fileName, '')
  patchTranscript(fileName, {
    running: true,
    started: true,
    error: undefined,
    messages: []
  })

  void (async () => {
    try {
      await new Promise<void>((resolve, reject) => {
        const subscription = agent
          .run({
            threadId: fileName,
            runId: randomUUID(),
            state: {},
            messages: [{ id: randomUUID(), role: 'user', content: prompt }],
            tools: [],
            context: [],
            forwardedProps: {}
          })
          .subscribe({
            next: (event) => {
              if (job.cancelled) return
              applyAguiEvent(fileName, event)
            },
            error: reject,
            complete: resolve
          })
        job.subscription = subscription
      })
      finishAssistant(fileName)
      if (!job.cancelled) {
        const current = transcripts.get(fileName)
        if (current?.running && !current.error) {
          patchTranscript(fileName, { running: false, error: undefined })
        }
      }
    } catch (error) {
      finishAssistant(fileName)
      if (!job.cancelled) {
        patchTranscript(fileName, {
          running: false,
          error: error instanceof Error ? error.message : String(error)
        })
      } else {
        patchTranscript(fileName, { running: false })
      }
    } finally {
      job.subscription?.unsubscribe()
      jobs.delete(fileName)
      streamBuf.delete(fileName)
      finishAssistant(fileName)
      const current = transcripts.get(fileName)
      if (current?.running) {
        patchTranscript(fileName, { running: false })
      } else {
        notify()
      }
      persistCompletedRound(fileName, prompt)
    }
  })()
}

/**
 * 离开进行中时取消该任务 Agent。未在跑则忽略。
 *
 * @param fileName - 任务文件名
 */
export async function stopTaskAgent(fileName: string): Promise<void> {
  const job = jobs.get(fileName)
  if (!job) return
  job.cancelled = true
  job.agent.abortRun()
  job.subscription?.unsubscribe()
  jobs.delete(fileName)
  streamBuf.delete(fileName)
  finishAssistant(fileName)
  patchTranscript(fileName, { running: false })
  persistCompletedRound(fileName, job.prompt)
}
