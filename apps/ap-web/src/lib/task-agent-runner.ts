import {
  EventType,
  randomUUID,
  type BaseEvent,
  type CustomEvent,
  type Message,
  type RunErrorEvent,
  type RunFinishedEvent,
  type RunStartedEvent,
  type TextMessageContentEvent
} from '@ag-ui/client'
import type { ApAgentWithAGUI } from '@openworker/ap-agent'
import { runWithLogContextAsync } from '@openworker/log'
import {
  isAguiTimelineSourceEvent,
  TEXT_DELTA_CUSTOM_NAME,
  TEXT_REVOKE_CUSTOM_NAME
} from '@openworker/ui/agui-timeline'
import type { Subscription } from 'rxjs'

import type { ChatTranscript } from '@/components/chat/chat-types'
import { createApWebAgent } from '@/ai/agent-runtime'
import { buildTaskPrompt } from '@/ai/build-prompt'
import { isAiAuthFailure } from '@/ai/config'
import { hasAssistantText, messageText } from './agui-message'
import { writeTaskChatFile } from './task-chat-fs'
import {
  forgetTaskChatTranscript,
  getOrCreateTranscript,
  getTranscript,
  hydrateTaskChatTranscript,
  nextChatMessageId,
  notifyTaskChatHints,
  patchTranscript
} from './task-chat-store'
import { findTaskByFileName, moveTask } from './task-fs'
import { TaskFsError } from './task-fs-error'
import { logScope } from './logger'
import type { TaskDetail } from './task-types'
import { getWorkspaceRoot } from './workspace-root'

type TaskAgentJob = {
  fileName: string
  agent: ApAgentWithAGUI
  subscription?: Subscription
  cancelled?: boolean
}

type TaskAgentStore = {
  jobs: Map<string, TaskAgentJob>
  streamBuf: Map<string, string>
  assistantMsgId: Map<string, string | null>
  eventListeners: Map<string, Set<(event: BaseEvent) => void>>
  runEventBuf: Map<string, BaseEvent[]>
}

const AGENT_STORE_KEY = '__apWebTaskAgent'

function getAgentStore(): TaskAgentStore {
  const g = globalThis as typeof globalThis & { [AGENT_STORE_KEY]?: TaskAgentStore }
  if (!g[AGENT_STORE_KEY]) {
    g[AGENT_STORE_KEY] = {
      jobs: new Map(),
      streamBuf: new Map(),
      assistantMsgId: new Map(),
      eventListeners: new Map(),
      runEventBuf: new Map()
    }
  }
  return g[AGENT_STORE_KEY]
}

const jobs = getAgentStore().jobs
const streamBuf = getAgentStore().streamBuf
const assistantMsgId = getAgentStore().assistantMsgId
const eventListeners = getAgentStore().eventListeners
const runEventBuf = getAgentStore().runEventBuf

function getOrCreate(fileName: string): ChatTranscript {
  return getOrCreateTranscript(fileName)
}

function emitAguiEvent(fileName: string, event: BaseEvent): void {
  let buf = runEventBuf.get(fileName)
  if (!buf) {
    buf = []
    runEventBuf.set(fileName, buf)
  }
  buf.push(event)
  const set = eventListeners.get(fileName)
  if (!set) return
  for (const listener of set) {
    listener(event)
  }
}

function clearRunEvents(fileName: string): void {
  runEventBuf.delete(fileName)
}

function retainAssistantEvents(
  prev: Record<string, BaseEvent[]> | undefined,
  messages: Message[]
): Record<string, BaseEvent[]> {
  if (!prev) return {}
  const ids = new Set(messages.map((item) => item.id))
  const next: Record<string, BaseEvent[]> = {}
  for (const [id, events] of Object.entries(prev)) {
    if (ids.has(id) && events.length > 0) next[id] = events
  }
  return next
}

function buildTaskContextPrefix(task: TaskDetail): string {
  return [
    `当前任务文件：${task.id}`,
    '',
    `# ${task.title}`,
    '',
    '## description',
    task.description.trim() || '（空）'
  ].join('\n')
}

function toAgentRunMessages(messages: Message[]): Message[] {
  return messages.filter((item) => {
    if (item.role === 'user' || item.role === 'assistant') {
      return Boolean(messageText(item).trim())
    }
    return true
  })
}

function prepareAgentRunMessages(task: TaskDetail, messages: Message[]): Message[] {
  const runMessages = toAgentRunMessages(messages)
  if (runMessages.length === 0) return runMessages

  const firstUserIdx = runMessages.findIndex((item) => item.role === 'user')
  if (firstUserIdx < 0) return runMessages

  const first = runMessages[firstUserIdx]!
  if (first.role !== 'user') return runMessages
  const firstText = messageText(first)
  if (firstText.includes('当前任务文件：') && firstText.includes('## Requirements')) {
    return runMessages
  }

  const prefix = buildTaskContextPrefix(task)
  const out = [...runMessages]
  out[firstUserIdx] = { ...first, role: 'user', content: `${prefix}\n\n${firstText}` }
  return out
}

function updateAssistantContent(fileName: string, text: string, replace = false): void {
  const amId = assistantMsgId.get(fileName)
  if (!amId) return
  const current = getOrCreate(fileName)
  const messages = [...current.messages]
  const idx = messages.findIndex((item) => item.id === amId)
  if (idx < 0) return
  const prev = messages[idx]!
  if (prev.role !== 'assistant') return
  const prevText = replace ? '' : messageText(prev)
  messages[idx] = {
    ...prev,
    role: 'assistant',
    content: replace ? text : prevText + text
  }
  patchTranscript(fileName, { messages, running: true, started: true })
}

function mergeLiveEventsIntoAssistant(fileName: string): void {
  const current = getOrCreate(fileName)
  if (current.liveEvents.length === 0) return
  let assistantId: string | null = null
  for (let i = current.messages.length - 1; i >= 0; i -= 1) {
    const item = current.messages[i]
    if (item?.role === 'assistant') {
      assistantId = item.id
      break
    }
  }
  if (!assistantId) {
    patchTranscript(fileName, { liveEvents: [] })
    return
  }
  const prev = current.assistantEvents?.[assistantId] ?? []
  patchTranscript(fileName, {
    liveEvents: [],
    assistantEvents: {
      ...current.assistantEvents,
      [assistantId]: [...prev, ...current.liveEvents]
    }
  })
}

function hasAssistantOutput(fileName: string, message: Message | undefined): boolean {
  if (!message || message.role !== 'assistant') return false
  if (hasAssistantText(message)) return true
  return Boolean(getOrCreate(fileName).assistantEvents?.[message.id]?.length)
}

function dropUnansweredRound(fileName: string): string | undefined {
  const current = getOrCreate(fileName)
  if (current.liveEvents.length > 0) return undefined
  const messages = [...current.messages]
  const last = messages.at(-1)
  if (last?.role === 'assistant') {
    if (hasAssistantOutput(fileName, last)) return undefined
    messages.pop()
  }
  const user = messages.at(-1)
  if (user?.role !== 'user') return undefined
  messages.pop()
  patchTranscript(fileName, { messages })
  return messageText(user)
}

function archiveDoingTaskIfWorked(fileName: string): void {
  try {
    const task = findTaskByFileName(fileName)
    if (!task || task.status !== 'doing') return
    moveTask(task.id, 'done')
  } catch (error) {
    logScope('task-agent').error(
      { fileName, err: error instanceof Error ? error.message : error },
      '归档到 done 失败'
    )
  }
}

function persistCompletedRound(fileName: string): void {
  try {
    const current = getTranscript(fileName)
    writeTaskChatFile(fileName, current?.messages ?? [])
  } catch (error) {
    logScope('task-chat').error(
      { fileName, err: error instanceof Error ? error.message : error },
      '写入 chat 文件失败'
    )
  }
}

function createTaskAgent(fileName: string): ApAgentWithAGUI {
  try {
    return createApWebAgent(getWorkspaceRoot(), `task:${fileName}`)
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
}

function applyAguiEvent(fileName: string, event: BaseEvent): void {
  if (event.type === EventType.RUN_STARTED) {
    const e = event as RunStartedEvent
    const startedAt = e.timestamp ?? Date.now()
    const aid = nextChatMessageId()
    assistantMsgId.set(fileName, aid)
    streamBuf.set(fileName, '')
    const current = getOrCreate(fileName)
    patchTranscript(fileName, {
      running: true,
      started: true,
      error: undefined,
      liveEvents: [],
      runStats: {
        runId: e.runId,
        traceId: `${fileName}:${e.runId}`,
        startedAt,
        durationMs: 0
      },
      messages: [...current.messages, { id: aid, role: 'assistant', content: '' }]
    })
    return
  }

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
      updateAssistantContent(fileName, streamBuf.get(fileName) ?? '', true)
      return
    }
    if (custom.name === TEXT_REVOKE_CUSTOM_NAME) {
      streamBuf.set(fileName, '')
      updateAssistantContent(fileName, '', true)
      return
    }
    return
  }

  if (event.type === EventType.TEXT_MESSAGE_CONTENT) {
    const e = event as TextMessageContentEvent
    const prev = streamBuf.get(fileName) ?? ''
    if (prev === e.delta) return
    streamBuf.set(fileName, prev.length > 0 && e.delta.startsWith(prev) ? e.delta : prev + e.delta)
    updateAssistantContent(fileName, streamBuf.get(fileName) ?? '', true)
    return
  }

  if (isAguiTimelineSourceEvent(event)) {
    const current = getOrCreate(fileName)
    if (event.type === EventType.RUN_ERROR) {
      const e = event as RunErrorEvent
      const cancelled = e.code === 'CANCELLED'
      if (!cancelled) {
        patchTranscript(fileName, {
          running: false,
          error: e.message || '执行失败',
          liveEvents: [...current.liveEvents, event]
        })
      } else {
        patchTranscript(fileName, { running: false, liveEvents: [] })
      }
      const stats = current.runStats
      if (stats?.startedAt) {
        patchTranscript(fileName, {
          runStats: {
            ...stats,
            durationMs: Math.max(0, Date.now() - stats.startedAt)
          }
        })
      }
      return
    }
    patchTranscript(fileName, {
      liveEvents: [...current.liveEvents, event]
    })
    return
  }

  if (event.type === EventType.RUN_FINISHED) {
    const e = event as RunFinishedEvent
    mergeLiveEventsIntoAssistant(fileName)
    const current = getOrCreate(fileName)
    const stats = current.runStats
    patchTranscript(fileName, {
      running: false,
      error: undefined,
      runStats: stats?.startedAt
        ? {
            ...stats,
            durationMs: Math.max(0, (e.timestamp ?? Date.now()) - stats.startedAt)
          }
        : stats
    })
    assistantMsgId.set(fileName, null)
    streamBuf.delete(fileName)
  }
}

function runTaskAgentJob(
  fileName: string,
  runMessages: Message[],
  options?: { resetMessages?: boolean; onStreamEvent?: (event: BaseEvent) => void }
): Promise<void> | void {
  if (jobs.has(fileName)) {
    if (options?.onStreamEvent) {
      return Promise.reject(new TaskFsError('当前任务 Agent 正在运行', 409, 'agent_busy'))
    }
    return
  }

  const agent = createTaskAgent(fileName)
  const job: TaskAgentJob = { fileName, agent }
  jobs.set(fileName, job)
  streamBuf.set(fileName, '')
  assistantMsgId.set(fileName, null)

  if (options?.resetMessages) {
    patchTranscript(fileName, {
      running: true,
      started: true,
      error: undefined,
      messages: [],
      liveEvents: [],
      assistantEvents: {},
      runStats: undefined
    })
  }

  const runPromise = runWithLogContextAsync({ sessionId: fileName }, async () => {
    try {
      await new Promise<void>((resolve, reject) => {
        const subscription = agent
          .run({
            threadId: fileName,
            runId: randomUUID(),
            state: {},
            messages: runMessages,
            tools: [],
            context: [],
            forwardedProps: {}
          })
          .subscribe({
            next: (streamEvent) => {
              if (job.cancelled) return
              applyAguiEvent(fileName, streamEvent)
              emitAguiEvent(fileName, streamEvent)
              options?.onStreamEvent?.(streamEvent)
            },
            error: reject,
            complete: resolve
          })
        job.subscription = subscription
      })
      if (!job.cancelled) {
        const current = getTranscript(fileName)
        if (current?.running && !current.error) {
          patchTranscript(fileName, { running: false, error: undefined })
        }
      }
    } catch (error) {
      mergeLiveEventsIntoAssistant(fileName)
      if (!job.cancelled) {
        patchTranscript(fileName, {
          running: false,
          error: error instanceof Error ? error.message : String(error),
          liveEvents: []
        })
      } else {
        patchTranscript(fileName, { running: false, liveEvents: [] })
      }
      throw error
    } finally {
      job.subscription?.unsubscribe()
      jobs.delete(fileName)
      streamBuf.delete(fileName)
      assistantMsgId.set(fileName, null)
      mergeLiveEventsIntoAssistant(fileName)
      const current = getTranscript(fileName)
      if (current?.running) {
        patchTranscript(fileName, { running: false, liveEvents: [] })
      } else {
        notifyTaskChatHints(true)
      }
      if (job.cancelled) dropUnansweredRound(fileName)
      persistCompletedRound(fileName)
      clearRunEvents(fileName)
      if (!job.cancelled) {
        const finished = getTranscript(fileName)
        if (finished && !finished.error) {
          archiveDoingTaskIfWorked(fileName)
        }
      }
    }
  })

  if (options?.onStreamEvent) {
    return runPromise
  }
  void runPromise
}

export function recordTaskAgentError(fileName: string, message: string): void {
  patchTranscript(fileName, {
    running: false,
    started: true,
    error: message
  })
}

export { hydrateTaskChatTranscript }

export function subscribeTaskChatEvents(
  fileName: string,
  listener: (event: BaseEvent) => void
): () => void {
  const buf = runEventBuf.get(fileName) ?? []
  for (const event of buf) {
    listener(event)
  }
  let set = eventListeners.get(fileName)
  if (!set) {
    set = new Set()
    eventListeners.set(fileName, set)
  }
  set.add(listener)
  return () => {
    const current = eventListeners.get(fileName)
    current?.delete(listener)
    if (current && current.size === 0) eventListeners.delete(fileName)
  }
}

export async function startTaskAgent(task: TaskDetail): Promise<void> {
  const fileName = task.fileName
  if (jobs.has(fileName)) return

  const prompt = buildTaskPrompt(task)
  runTaskAgentJob(fileName, [{ id: randomUUID(), role: 'user', content: prompt }], {
    resetMessages: true
  })
}

export function isTaskAgentRunning(fileName: string): boolean {
  return jobs.has(fileName)
}

export async function sendTaskAgentMessage(
  task: TaskDetail,
  text: string,
  options?: { id?: string }
): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed) return
  const fileName = task.fileName
  if (jobs.has(fileName)) {
    throw new TaskFsError('当前任务 Agent 正在运行', 409, 'agent_busy')
  }

  const current = getOrCreate(fileName)
  const userMessage: Message = {
    id: options?.id?.trim() || nextChatMessageId(),
    role: 'user',
    content: trimmed
  }
  const messages = [...current.messages, userMessage]
  patchTranscript(fileName, { messages, error: undefined, started: true, running: true })

  runTaskAgentJob(fileName, prepareAgentRunMessages(task, messages))
}

export async function editResendTaskAgentMessage(
  task: TaskDetail,
  messageId: string,
  text: string
): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed) return
  const fileName = task.fileName
  if (jobs.has(fileName)) {
    throw new TaskFsError('当前任务 Agent 正在运行', 409, 'agent_busy')
  }

  const current = getOrCreate(fileName)
  const idx = current.messages.findIndex((item) => item.id === messageId)
  const user = idx >= 0 ? current.messages[idx] : undefined
  if (!user || user.role !== 'user') {
    throw new TaskFsError('找不到要编辑的用户消息', 400, 'invalid_message')
  }
  const messages: Message[] = [
    ...current.messages.slice(0, idx),
    { ...user, role: 'user', content: trimmed }
  ]
  patchTranscript(fileName, {
    messages,
    error: undefined,
    liveEvents: [],
    started: true,
    running: true,
    assistantEvents: retainAssistantEvents(current.assistantEvents, messages)
  })
  runTaskAgentJob(fileName, prepareAgentRunMessages(task, messages))
}

export function forgetTaskChat(fileName: string): void {
  forgetTaskChatTranscript(fileName)
  streamBuf.delete(fileName)
  assistantMsgId.delete(fileName)
  clearRunEvents(fileName)
}

export async function stopTaskAgent(fileName: string): Promise<string | undefined> {
  const job = jobs.get(fileName)
  if (job) {
    job.cancelled = true
    job.agent.abortRun()
    job.subscription?.unsubscribe()
    jobs.delete(fileName)
  }
  streamBuf.delete(fileName)
  assistantMsgId.set(fileName, null)
  mergeLiveEventsIntoAssistant(fileName)
  const restoredInput = dropUnansweredRound(fileName)
  patchTranscript(fileName, { running: false, liveEvents: [] })
  persistCompletedRound(fileName)
  return restoredInput
}
