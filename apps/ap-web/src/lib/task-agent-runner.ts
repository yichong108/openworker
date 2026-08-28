import {
  EventType,
  randomUUID,
  type BaseEvent,
  type CustomEvent,
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

import type { ChatMessage, ChatTranscript } from '@/components/chat/chat-types'
import { createApWebAgent } from './ap-agent-runtime'
import { isAiAuthFailure } from './ai-config'
import { readTaskChatFile, writeTaskChatFile } from './task-chat-fs'
import { TaskFsError } from './task-fs-error'
import type { TaskDetail } from './task-types'
import { getWorkspaceRoot } from './workspace-root'

type AgentRunMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

type TaskAgentJob = {
  fileName: string
  agent: ApAgentWithAGUI
  subscription?: Subscription
  cancelled?: boolean
}

const jobs = new Map<string, TaskAgentJob>()
const transcripts = new Map<string, ChatTranscript>()
const hydratedFiles = new Set<string>()
const streamBuf = new Map<string, string>()
const assistantMsgId = new Map<string, string | null>()
const listeners = new Set<(payload: Record<string, ChatTranscript>) => void>()
let messageSeq = 0

/**
 * 生成会话消息 id。
 *
 * @returns 唯一 id
 */
function nextMessageId(): string {
  messageSeq += 1
  return `m${messageSeq}`
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
 * 广播全量 transcript 给 SSE 订阅者。
 */
function notify(): void {
  const payload = Object.fromEntries(transcripts)
  for (const listener of listeners) {
    listener(payload)
  }
}

/**
 * 局部更新 transcript 并通知订阅者。
 *
 * @param fileName - 任务文件名
 * @param partial - 要合并的字段
 */
function patchTranscript(fileName: string, partial: Partial<ChatTranscript>): void {
  const current = getOrCreate(fileName)
  transcripts.set(fileName, {
    ...current,
    ...partial,
    messages: partial.messages ?? current.messages,
    liveEvents: partial.liveEvents ?? current.liveEvents
  })
  notify()
}

/**
 * 根据任务详情拼出自动执行 prompt。
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

/**
 * 将 transcript 转为 Agent run 消息列表。
 *
 * @param messages - 会话消息
 * @returns AG-UI 消息
 */
function toAgentRunMessages(messages: ChatMessage[]): AgentRunMessage[] {
  return messages
    .filter((item) => item.role === 'user' || item.role === 'assistant')
    .filter((item) => item.content.trim())
    .map((item) => ({
      id: item.id,
      role: item.role as 'user' | 'assistant',
      content: item.content
    }))
}

/**
 * 发给 Agent 的消息：首条 user 注入任务上下文（仅进模型，UI 仍用原文）。
 *
 * @param task - 任务详情
 * @param messages - 客户端会话消息
 * @returns run 消息列表
 */
function prepareAgentRunMessages(task: TaskDetail, messages: ChatMessage[]): AgentRunMessage[] {
  const runMessages = toAgentRunMessages(messages)
  if (runMessages.length === 0) return runMessages

  const firstUserIdx = runMessages.findIndex((item) => item.role === 'user')
  if (firstUserIdx < 0) return runMessages

  const first = runMessages[firstUserIdx]!
  if (first.content.includes('当前任务文件：') && first.content.includes('## Requirements')) {
    return runMessages
  }

  const prefix = buildTaskContextPrefix(task)
  const out = [...runMessages]
  out[firstUserIdx] = { ...first, content: `${prefix}\n\n${first.content}` }
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
  messages[idx] = {
    ...prev,
    content: replace ? text : prev.content + text,
    streaming: true
  }
  patchTranscript(fileName, { messages, running: true, started: true })
}

/**
 * 结束 assistant 流式标记。
 *
 * @param fileName - 任务文件名
 */
function finishAssistant(fileName: string): void {
  const current = getOrCreate(fileName)
  const messages = current.messages.map((item) =>
    item.streaming ? { ...item, streaming: false } : item
  )
  patchTranscript(fileName, { messages })
}

/**
 * 将 liveEvents 合并进最新 assistant 并清空缓冲。
 *
 * @param fileName - 任务文件名
 */
function mergeLiveEventsIntoAssistant(fileName: string): void {
  const current = getOrCreate(fileName)
  if (current.liveEvents.length === 0) return
  const messages = [...current.messages]
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const item = messages[i]
    if (item?.role === 'assistant') {
      const prev = item.aguiEvents ?? []
      messages[i] = {
        ...item,
        aguiEvents: [...prev, ...current.liveEvents],
        streaming: false
      }
      break
    }
  }
  patchTranscript(fileName, { messages, liveEvents: [] })
}

/**
 * 一轮结束后把 user/assistant 正文写入 chat 文件。
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
      messages: [...current.messages, { id: aid, role: 'assistant', content: '', streaming: true }]
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
    finishAssistant(fileName)
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
  runMessages: AgentRunMessage[],
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
            messages: runMessages.map((item) => ({
              id: item.id,
              role: item.role,
              content: item.content
            })),
            tools: [],
            context: [],
            forwardedProps: {}
          })
          .subscribe({
            next: (streamEvent) => {
              if (job.cancelled) return
              applyAguiEvent(fileName, streamEvent)
              options?.onStreamEvent?.(streamEvent)
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
      finishAssistant(fileName)
      mergeLiveEventsIntoAssistant(fileName)
      const current = transcripts.get(fileName)
      if (current?.running) {
        patchTranscript(fileName, { running: false, liveEvents: [] })
      } else {
        notify()
      }
      persistCompletedRound(fileName)
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

  const prompt = buildTaskPrompt(task)
  runTaskAgentJob(fileName, [{ id: randomUUID(), role: 'user', content: prompt }], {
    resetMessages: true
  })
}

/**
 * 以客户端交出的完整 messages 覆盖 transcript 并 run，SSE 逐条回调 AG-UI 事件。
 *
 * @param task - 任务详情
 * @param clientMessages - 客户端当前会话
 * @param onStreamEvent - 每条 AG-UI 事件
 */
export async function runTaskAgentFromClientMessages(
  task: TaskDetail,
  clientMessages: AgentRunMessage[],
  onStreamEvent: (event: BaseEvent) => void
): Promise<void> {
  const fileName = task.fileName
  if (jobs.has(fileName)) {
    throw new TaskFsError('当前任务 Agent 正在运行', 409, 'agent_busy')
  }

  const chatMessages: ChatMessage[] = clientMessages.map((item) => ({
    id: item.id,
    role: item.role,
    content: item.content
  }))
  patchTranscript(fileName, {
    messages: chatMessages,
    error: undefined,
    liveEvents: [],
    started: true
  })

  const runMessages = prepareAgentRunMessages(task, chatMessages)
  await runTaskAgentJob(fileName, runMessages, { onStreamEvent })
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
export async function sendTaskAgentMessage(task: TaskDetail, text: string): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed) return
  const fileName = task.fileName
  if (jobs.has(fileName)) {
    throw new TaskFsError('当前任务 Agent 正在运行', 409, 'agent_busy')
  }

  const current = getOrCreate(fileName)
  const hasPriorUser = current.messages.some((item) => item.role === 'user')
  const userContent = hasPriorUser ? trimmed : `${buildTaskContextPrefix(task)}\n\n${trimmed}`
  const userMessage: ChatMessage = {
    id: nextMessageId(),
    role: 'user',
    content: userContent
  }
  const messages = [...current.messages, userMessage]
  patchTranscript(fileName, { messages, error: undefined })

  runTaskAgentJob(fileName, toAgentRunMessages(messages))
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
  if (idx < 0 || current.messages[idx]?.role !== 'user') {
    throw new TaskFsError('找不到要编辑的用户消息', 400, 'invalid_message')
  }

  const messages = [
    ...current.messages.slice(0, idx),
    { ...current.messages[idx]!, content: trimmed, aguiEvents: undefined }
  ]
  patchTranscript(fileName, { messages, error: undefined, liveEvents: [] })
  runTaskAgentJob(fileName, toAgentRunMessages(messages))
}

/**
 * 停止该任务 Agent。未在跑则忽略。
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
  assistantMsgId.set(fileName, null)
  finishAssistant(fileName)
  mergeLiveEventsIntoAssistant(fileName)
  patchTranscript(fileName, { running: false, liveEvents: [] })
  persistCompletedRound(fileName)
}
