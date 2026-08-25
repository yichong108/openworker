import { Agent, Cursor, CursorAgentError, type SDKMessage } from '@cursor/sdk'

import type { ChatTranscript } from '@/components/chat/chat-types'
import { isAiAuthFailure, readAiConfig } from './ai-config'
import { loadCursorEnv, resolveModelId } from './load-env'
import { writeTaskChatFile } from './task-chat-fs'
import { TaskFsError } from './task-fs-error'
import type { TaskDetail } from './task-types'
import { getWorkspaceRoot } from './workspace-root'

type AgentInstance = Awaited<ReturnType<typeof Agent.create>>
type RunInstance = Awaited<ReturnType<AgentInstance['send']>>

type TaskAgentJob = {
  fileName: string
  prompt: string
  agent: AgentInstance
  run?: RunInstance
  cancelled?: boolean
}

const jobs = new Map<string, TaskAgentJob>()
const transcripts = new Map<string, ChatTranscript>()
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
 * 把 Cursor SDK 流事件写入会话。
 *
 * @param fileName - 任务文件名
 * @param event - SDKMessage
 */
function applyStreamEvent(fileName: string, event: SDKMessage): void {
  switch (event.type) {
    case 'assistant':
      for (const block of event.message.content) {
        if (block.type === 'text') appendAssistantDelta(fileName, block.text)
      }
      break
    case 'tool_call':
      appendSystem(fileName, `工具 ${event.status} ${event.name}`)
      finishAssistant(fileName)
      break
    default:
      break
  }
}

async function ensureCursorAuth(apiKey: string): Promise<void> {
  if (apiKey) return
  try {
    const status = await Cursor.auth.status()
    if (status.status !== 'logged-in') {
      throw new TaskFsError('Cursor 未登录且未填写 API Key，请先完成 AI 配置', 401, 'ai_auth')
    }
  } catch (error) {
    if (error instanceof TaskFsError) throw error
    throw new TaskFsError('Cursor 鉴权失败，请先完成 AI 配置', 401, 'ai_auth')
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

  loadCursorEnv()
  const workspaceRoot = getWorkspaceRoot()
  const prompt = buildTaskPrompt(task)
  const config = readAiConfig()
  const apiKey = config.cursor.apiKey.trim() || process.env.CURSOR_API_KEY?.trim() || ''
  const model = config.cursor.model.trim() || resolveModelId()

  await ensureCursorAuth(apiKey)

  let agent: AgentInstance
  try {
    agent = await Agent.create({
      ...(apiKey ? { apiKey } : {}),
      name: `task:${fileName}`,
      model: { id: model },
      mode: 'agent',
      local: {
        cwd: workspaceRoot,
        settingSources: ['project']
      }
    })
  } catch (error) {
    if (error instanceof CursorAgentError || isAiAuthFailure(error)) {
      throw new TaskFsError(
        `模型鉴权失败：${error instanceof Error ? error.message : '未知错误'}`,
        401,
        'ai_auth'
      )
    }
    throw error
  }

  const job: TaskAgentJob = { fileName, prompt, agent }
  jobs.set(fileName, job)
  patchTranscript(fileName, {
    running: true,
    started: true,
    error: undefined,
    messages: []
  })

  void (async () => {
    try {
      const run = await agent.send(prompt)
      job.run = run
      if (run.supports('stream')) {
        for await (const event of run.stream()) {
          if (job.cancelled) break
          applyStreamEvent(fileName, event)
        }
      }
      const result = await run.wait()
      finishAssistant(fileName)
      if (!job.cancelled && result.status === 'error') {
        patchTranscript(fileName, {
          running: false,
          error: '执行失败'
        })
        return
      }
      patchTranscript(fileName, { running: false, error: undefined })
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
      try {
        await agent[Symbol.asyncDispose]()
      } catch {
        /* 忽略释放失败 */
      }
      jobs.delete(fileName)
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
  try {
    if (job.run?.supports('cancel')) {
      await job.run.cancel()
    }
  } finally {
    try {
      await job.agent[Symbol.asyncDispose]()
    } catch {
      /* 忽略 */
    }
    jobs.delete(fileName)
    finishAssistant(fileName)
    patchTranscript(fileName, { running: false })
    persistCompletedRound(fileName, job.prompt)
  }
}
