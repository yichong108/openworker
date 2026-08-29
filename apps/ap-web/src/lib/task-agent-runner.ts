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
import {
  isAguiTimelineSourceEvent,
  TEXT_DELTA_CUSTOM_NAME,
  TEXT_REVOKE_CUSTOM_NAME
} from '../../../../packages/ui/src/chat-session/agui-timeline.js'
import type { Subscription } from 'rxjs'

import type { ChatTranscript, TaskChatHint } from '@/components/chat/chat-types'
import { createApWebAgent } from '@/ai/agent-runtime'
import { buildTaskPrompt } from '@/ai/build-prompt'
import { isAiAuthFailure } from '@/ai/config'
import { chatTranscriptHint, hasAssistantText, messageText } from './agui-message'
import { readTaskChatFile, writeTaskChatFile } from './task-chat-fs'
import { findTaskByFileName, moveTask } from './task-fs'
import { TaskFsError } from './task-fs-error'
import type { TaskDetail } from './task-types'
import { getWorkspaceRoot } from './workspace-root'

type TaskAgentJob = {
  fileName: string
  agent: ApAgentWithAGUI
  subscription?: Subscription
  cancelled?: boolean
}

type TaskChatStore = {
  jobs: Map<string, TaskAgentJob>
  transcripts: Map<string, ChatTranscript>
  hydratedFiles: Set<string>
  streamBuf: Map<string, string>
  assistantMsgId: Map<string, string | null>
  hintListeners: Set<(payload: Record<string, TaskChatHint>) => void>
  eventListeners: Map<string, Set<(event: BaseEvent) => void>>
  runEventBuf: Map<string, BaseEvent[]>
  hintTimer: ReturnType<typeof setTimeout> | undefined
  messageSeq: number
}

const globalStore = globalThis as typeof globalThis & {
  __apWebTaskChat?: TaskChatStore
}

function getStore(): TaskChatStore {
  if (!globalStore.__apWebTaskChat) {
    globalStore.__apWebTaskChat = {
      jobs: new Map(),
      transcripts: new Map(),
      hydratedFiles: new Set(),
      streamBuf: new Map(),
      assistantMsgId: new Map(),
      hintListeners: new Set(),
      eventListeners: new Map(),
      runEventBuf: new Map(),
      hintTimer: undefined,
      messageSeq: 0
    }
  }
  const store = globalStore.__apWebTaskChat
  if (!store.hintListeners) store.hintListeners = new Set()
  if (!store.eventListeners) store.eventListeners = new Map()
  if (!store.runEventBuf) store.runEventBuf = new Map()
  return store
}

const jobs = getStore().jobs
const transcripts = getStore().transcripts
const hydratedFiles = getStore().hydratedFiles
const streamBuf = getStore().streamBuf
const assistantMsgId = getStore().assistantMsgId
const hintListeners = getStore().hintListeners
const eventListeners = getStore().eventListeners
const runEventBuf = getStore().runEventBuf

/**
 * 生成会话消息 id。
 *
 * @returns 唯一 id
 */
function nextMessageId(): string {
  const store = getStore()
  store.messageSeq += 1
  return `m${store.messageSeq}`
}

/**
 * 空会话快照。
 *
 * @returns 初始 transcript
 */
function emptyTranscript(): ChatTranscript {
  return { running: false, started: false, messages: [], liveEvents: [] }
}

/**
 * 从磁盘恢复历史（仅首次）。
 *
 * @param fileName - 任务文件名
 */
function hydrateFromDisk(fileName: string): void {
  if (hydratedFiles.has(fileName) || transcripts.has(fileName)) {
    hydratedFiles.add(fileName)
    return
  }
  hydratedFiles.add(fileName)
  const fromDisk = readTaskChatFile(fileName)
  if (fromDisk.length === 0) return
  transcripts.set(fileName, {
    running: false,
    started: true,
    messages: fromDisk,
    liveEvents: []
  })
}

/**
 * 获取或创建内存 transcript，必要时从磁盘 hydrate。
 *
 * @param fileName - 任务文件名
 * @returns 会话快照
 */
function getOrCreate(fileName: string): ChatTranscript {
  hydrateFromDisk(fileName)
  const current = transcripts.get(fileName)
  if (current) return current
  const created = emptyTranscript()
  transcripts.set(fileName, created)
  return created
}

/**
 * 当前全部任务的卡片 hint。
 */
export function listTaskChatHints(): Record<string, TaskChatHint> {
  const out: Record<string, TaskChatHint> = {}
  for (const [fileName, transcript] of transcripts) {
    out[fileName] = chatTranscriptHint(transcript)
  }
  return out
}

function flushHints(): void {
  const store = getStore()
  if (store.hintTimer) {
    clearTimeout(store.hintTimer)
    store.hintTimer = undefined
  }
  const payload = listTaskChatHints()
  for (const listener of hintListeners) {
    listener(payload)
  }
}

/**
 * 广播卡片 hint。running/error 变化立刻推；正文预览节流。
 *
 * @param immediate - 是否立刻推
 */
function notifyHints(immediate = false): void {
  const store = getStore()
  if (immediate) {
    flushHints()
    return
  }
  if (store.hintTimer) return
  store.hintTimer = setTimeout(() => {
    store.hintTimer = undefined
    flushHints()
  }, 100)
}

/**
 * 把当前 run 的 AG-UI 事件推给该任务的订阅者（含重放缓冲）。
 *
 * @param fileName - 任务文件名
 * @param event - Agent 流出的事件
 */
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

/**
 * 局部更新 transcript 并通知订阅者。
 *
 * @param fileName - 任务文件名
 * @param partial - 要合并的字段
 */
function patchTranscript(fileName: string, partial: Partial<ChatTranscript>): void {
  const current = getOrCreate(fileName)
  const prevRunning = current.running
  const prevError = current.error
  const prevStarted = current.started
  transcripts.set(fileName, {
    ...current,
    ...partial,
    messages: partial.messages ?? current.messages,
    liveEvents: partial.liveEvents ?? current.liveEvents,
    assistantEvents: partial.assistantEvents ?? current.assistantEvents
  })
  const next = transcripts.get(fileName)!
  const statusChanged =
    next.running !== prevRunning || next.error !== prevError || next.started !== prevStarted
  notifyHints(statusChanged)
}

/**
 * 只保留仍存在的 assistant 时间线。
 *
 * @param prev - 旧时间线
 * @param messages - 当前消息
 * @returns 过滤后的时间线
 */
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

/**
 * 手动首条消息时附带的任务上下文前缀。
 *
 * @param task - 任务详情
 * @returns 上下文块
 */
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

/**
 * 将 transcript 转为发给 Agent 的 AG-UI 消息（去掉空 user/assistant）。
 *
 * @param messages - 会话消息
 * @returns AG-UI 消息
 */
function toAgentRunMessages(messages: Message[]): Message[] {
  return messages.filter((item) => {
    if (item.role === 'user' || item.role === 'assistant') {
      return Boolean(messageText(item).trim())
    }
    return true
  })
}

/**
 * 发给 Agent 的消息：首条 user 注入任务上下文（仅进模型，UI 仍用原文）。
 *
 * @param task - 任务详情
 * @param messages - 客户端会话消息
 * @returns run 消息列表
 */
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

/**
 * 更新当前 assistant 流式正文。
 *
 * @param fileName - 任务文件名
 * @param text - 增量或全文
 * @param replace - 是否替换而非追加
 */
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

/**
 * 将 liveEvents 挂到最新 assistant id 上（不写入 Message）。
 *
 * @param fileName - 任务文件名
 */
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

/**
 * 助手是否已产出正文或过程事件。
 *
 * @param fileName - 任务文件名
 * @param message - 消息
 * @returns 有回复数据则为 true
 */
function hasAssistantOutput(fileName: string, message: Message | undefined): boolean {
  if (!message || message.role !== 'assistant') return false
  if (hasAssistantText(message)) return true
  return Boolean(getOrCreate(fileName).assistantEvents?.[message.id]?.length)
}

/**
 * 停止时若本轮尚无 Agent 回复，去掉空 assistant 与这一轮 user，避免落盘。
 *
 * @param fileName - 任务文件名
 * @returns 被撤下的用户原文；无需撤下则为 undefined
 */
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

/**
 * Agent 成功结束后，若任务仍在 doing，自动移到 done。
 *
 * @param fileName - 任务文件名
 */
function archiveDoingTaskIfWorked(fileName: string): void {
  try {
    const task = findTaskByFileName(fileName)
    if (!task || task.status !== 'doing') return
    moveTask(task.id, 'done')
  } catch (error) {
    console.error(
      `[task-agent] 归档到 done 失败 ${fileName}:`,
      error instanceof Error ? error.message : error
    )
  }
}

/**
 * 一轮结束后把已完成的 user/assistant 回合写入 chat 文件。
 * 没有助手回复的 user 由落盘层丢掉，避免写出半截问答。
 *
 * @param fileName - 任务文件名
 */
function persistCompletedRound(fileName: string): void {
  try {
    const current = transcripts.get(fileName)
    writeTaskChatFile(fileName, current?.messages ?? [])
  } catch (error) {
    console.error(
      `[task-chat] 写入失败 ${fileName}:`,
      error instanceof Error ? error.message : error
    )
  }
}

/**
 * 创建 ApAgentWithAGUI，统一鉴权错误。
 *
 * @param fileName - 任务文件名
 * @returns Agent 实例
 */
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

/**
 * 将 AG-UI 流事件写入会话。
 *
 * @param fileName - 任务文件名
 * @param event - AG-UI BaseEvent
 */
function applyAguiEvent(fileName: string, event: BaseEvent): void {
  if (event.type === EventType.RUN_STARTED) {
    const e = event as RunStartedEvent
    const startedAt = e.timestamp ?? Date.now()
    const aid = nextMessageId()
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

/**
 * 启动 Agent run 并在后台消费事件流。
 *
 * @param fileName - 任务文件名
 * @param runMessages - 发给 Agent 的消息
 * @param options - 运行前 transcript 调整 / SSE 回调
 * @returns 带 onStreamEvent 时返回 Promise，否则 fire-and-forget
 */
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

  const runPromise = (async () => {
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
        const current = transcripts.get(fileName)
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
      const current = transcripts.get(fileName)
      if (current?.running) {
        patchTranscript(fileName, { running: false, liveEvents: [] })
      } else {
        notifyHints(true)
      }
      if (job.cancelled) dropUnansweredRound(fileName)
      persistCompletedRound(fileName)
      clearRunEvents(fileName)
      if (!job.cancelled) {
        const finished = transcripts.get(fileName)
        if (finished && !finished.error) {
          archiveDoingTaskIfWorked(fileName)
        }
      }
    }
  })()

  if (options?.onStreamEvent) {
    return runPromise
  }
  void runPromise
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
 * 确保 transcript 已从磁盘 hydrate。
 *
 * @param fileName - 任务文件名
 * @returns 会话快照
 */
export function hydrateTaskChatTranscript(fileName: string): ChatTranscript {
  return getOrCreate(fileName)
}

/**
 * 订阅卡片 hint（看板 SSE）。
 *
 * @param listener - 全量 hints
 * @returns 取消订阅
 */
export function subscribeTaskChatHints(
  listener: (payload: Record<string, TaskChatHint>) => void
): () => void {
  hintListeners.add(listener)
  return () => {
    hintListeners.delete(listener)
  }
}

/**
 * 订阅某任务当前 run 的 AG-UI 事件（先重放缓冲，再收增量）。
 *
 * @param fileName - 任务文件名
 * @param listener - 事件回调
 * @returns 取消订阅
 */
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

/**
 * 执行单个卡片任务
 *
 * @param task - 移动后的任务详情
 */
export async function startTaskAgent(task: TaskDetail): Promise<void> {
  const fileName = task.fileName
  if (jobs.has(fileName)) return

  const prompt = buildTaskPrompt(task)
  runTaskAgentJob(fileName, [{ id: randomUUID(), role: 'user', content: prompt }], {
    resetMessages: true
  })
}

/**
 * 该任务 Agent 是否正在 run。
 *
 * @param fileName - 任务文件名
 */
export function isTaskAgentRunning(fileName: string): boolean {
  return jobs.has(fileName)
}

/**
 * 手动发送用户消息并启动 Agent run。
 *
 * @param task - 任务详情
 * @param text - 用户输入
 */
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
    id: options?.id?.trim() || nextMessageId(),
    role: 'user',
    content: trimmed
  }
  const messages = [...current.messages, userMessage]
  patchTranscript(fileName, { messages, error: undefined, started: true, running: true })

  runTaskAgentJob(fileName, prepareAgentRunMessages(task, messages))
}

/**
 * 编辑用户消息并从此处重发。
 *
 * @param task - 任务详情
 * @param messageId - 用户消息 id
 * @param text - 编辑后的文本
 */
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

/**
 * 从内存去掉该任务会话，供删除任务后不再出现在 SSE 快照里。
 *
 * @param fileName - 任务文件名
 */
export function forgetTaskChat(fileName: string): void {
  transcripts.delete(fileName)
  hydratedFiles.delete(fileName)
  streamBuf.delete(fileName)
  assistantMsgId.delete(fileName)
  clearRunEvents(fileName)
  notifyHints(true)
}

/**
 * 停止该任务 Agent。没有 in-flight job 时仍把 running 清掉，避免 UI 卡死。
 *
 * @param fileName - 任务文件名
 * @returns 若本轮无回复被撤下，返回该用户原文
 */
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
