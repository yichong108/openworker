/**
 * Native 会话级 Agent 运行时：run / cancel / hydrate，经 SSE 推送 AG-UI 事件
 */

import { terminalManager } from '@openworker/shared'
import { EventType, type Message, type RunErrorEvent, type RunStartedEvent } from '@ag-ui/client'
import {
  type AgentSendOptions,
  MAX_AGENT_LOOP_STEPS,
  normalizeComposerMode
} from '@openworker/shared'

import { createSessionAgent, type SessionAguiAgent } from './agent-instance.js'
import { agentLog } from './agent-log.js'
import { resolveChatModel } from './chat-model.js'
import {
  clearSessionWorking,
  createMemorySummarizer,
  prepareSessionMemory,
  refreshUserProfileFromMessages
} from './memory.js'
import { emitSessionStream } from './agent-stream.js'
import {
  clearSessionMessagesCache,
  ensureSessionMessagesLoaded,
  getCachedSessionMessages,
  persistSessionAguiMessages
} from './session-messages.js'
import { getAppSettings } from '../services/settings-service.js'
import { getSession } from '../services/session-service.js'
import { getWorkspace } from '../services/workspace-service.js'

/** agent.subscribe 返回的取消句柄 */
type AgentUnsubscribe = { unsubscribe: () => void }

type SessionRuntime = {
  workspaceId: string
  /** 该会话独立的 AG-UI agent（勿跨会话复用）；消息以 agent.messages 为准 */
  agent: SessionAguiAgent
  controller: AbortController | null
  subscription: AgentUnsubscribe | null
  terminalKey: string
}

/**
 * 按工作区路径创建会话级 AG-UI Agent。
 *
 * @param cwd - 工作区绝对路径
 * @param sessionId - 会话 ID（作为 AG-UI threadId）
 * @param messages - AG-UI 初始消息（可选）
 * @returns 新 SessionAguiAgent
 */
function createAgentForWorkspace(
  cwd: string | undefined,
  sessionId: string,
  messages?: Message[]
): SessionAguiAgent {
  return createSessionAgent({ cwd, messages, threadId: sessionId })
}

const sessions = new Map<string, SessionRuntime>()

/**
 * 生成本轮 runId。
 *
 * @returns runId 字符串
 */
function makeRunId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 初始化或校正会话运行时：每个会话绑定独立 AG-UI Agent。
 *
 * @param workspaceId - 工作区 ID
 * @param sessionId - 会话 ID
 * @param cwd - 工作区路径（可选）
 */
export function initSessionState(workspaceId: string, sessionId: string, cwd?: string): void {
  const existing = sessions.get(sessionId)
  if (existing) {
    if (existing.workspaceId !== workspaceId) {
      const prev = existing.agent
      existing.workspaceId = workspaceId
      existing.agent = createAgentForWorkspace(cwd, sessionId, prev.messages)
      void prev.dispose()
    }
    return
  }

  const messages = getCachedSessionMessages(sessionId)
  sessions.set(sessionId, {
    workspaceId,
    agent: createAgentForWorkspace(cwd, sessionId, messages),
    controller: null,
    subscription: null,
    terminalKey: `term:${sessionId}`
  })
}

/**
 * 确保会话 Agent 已加载完整 Message[]。
 *
 * @param sessionId - 会话 ID
 */
export async function ensureSessionAgentHydrated(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId)
  if (!session) return
  const messages = await ensureSessionMessagesLoaded(sessionId)
  if (session.agent.messages.length === 0 && messages.length > 0) {
    session.agent.messages = messages
  }
}

/**
 * 读取会话当前 AG-UI Message 列表。
 *
 * @param sessionId - 会话 ID
 * @returns AG-UI Message 列表（无会话时为空数组）
 */
export function getSessionAguiMessages(sessionId: string): Message[] {
  return sessions.get(sessionId)?.agent.messages ?? []
}

/**
 * 清除会话运行时：取消进行中的 run、释放 agent、杀掉终端进程并删除会话条目。
 *
 * @param sessionId - 会话 ID
 */
export function clearSessionState(sessionId: string): void {
  const s = sessions.get(sessionId)
  if (s?.controller) {
    s.controller.abort()
  }
  s?.subscription?.unsubscribe()
  s?.agent.abortRun()
  if (s?.agent) {
    void s.agent.dispose()
  }
  void terminalManager.killCommand(s?.terminalKey ?? `term:${sessionId}`)
  sessions.delete(sessionId)
  clearSessionWorking(sessionId)
  clearSessionMessagesCache(sessionId)
}

/**
 * 取消当前会话进行中的 run。
 *
 * @param sessionId - 会话 ID
 */
export function cancelRun(sessionId: string): void {
  const s = sessions.get(sessionId)
  if (s?.controller) {
    s.controller.abort()
    s.controller = null
  }
  s?.subscription?.unsubscribe()
  if (s) s.subscription = null
  s?.agent.abortRun()
  void terminalManager.killCommand(`term:${sessionId}`)
}

/**
 * 当前会话是否已有智能体在运行。
 *
 * @param sessionId - 会话 ID
 * @returns 若该会话存在且 controller 非空则为 true
 */
export function isSessionRunning(sessionId: string): boolean {
  return Boolean(sessions.get(sessionId)?.controller)
}

/**
 * 发送预检失败的 AG-UI 边界事件（RUN_STARTED + RUN_ERROR）。
 *
 * @param sessionId - 会话 ID
 * @param message - 错误文案
 * @param runId - 可选 runId
 */
function emitPreRunError(sessionId: string, message: string, runId?: string): void {
  const id = runId ?? makeRunId()
  const started: RunStartedEvent = {
    type: EventType.RUN_STARTED,
    threadId: sessionId,
    runId: id,
    timestamp: Date.now()
  }
  emitSessionStream({ sessionId, event: started })
  const err: RunErrorEvent = {
    type: EventType.RUN_ERROR,
    message,
    code: 'ERROR',
    timestamp: Date.now()
  }
  emitSessionStream({ sessionId, event: err })
}

/**
 * 截断 AG-UI 消息列表：去掉从第 `userOrdinal` 条用户消息起的全部历史。
 *
 * @param messages - 当前 AG-UI 消息
 * @param userOrdinal - 用户消息序号（0-based）
 * @returns 截断后的消息列表
 */
function truncateMessagesBeforeUserOrdinal(messages: Message[], userOrdinal: number): Message[] {
  if (userOrdinal < 0) return messages
  let seen = 0
  for (let i = 0; i < messages.length; i += 1) {
    if (messages[i]?.role !== 'user') continue
    if (seen === userOrdinal) return messages.slice(0, i)
    seen += 1
  }
  return messages
}

/**
 * 将完整 AG-UI Message[] 异步写入 SQLite（失败只打日志）。
 *
 * @param sessionId - 会话 ID
 * @param messages - 完整 AG-UI 轨迹
 */
async function persistSessionMessages(sessionId: string, messages: Message[]): Promise<void> {
  try {
    await persistSessionAguiMessages(sessionId, messages)
  } catch (error) {
    agentLog.warn(
      `[persistSessionMessages] failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * 确保会话 runtime 已根据 SQLite 元数据就绪。
 *
 * @param sessionId - 会话 ID
 */
async function ensureRuntimeReady(sessionId: string): Promise<SessionRuntime | null> {
  const meta = await getSession(sessionId)
  let cwd: string | undefined
  try {
    const ws = await getWorkspace(meta.workspaceId)
    cwd = ws.path?.trim() || undefined
  } catch {
    cwd = undefined
  }
  initSessionState(meta.workspaceId, sessionId, cwd)
  await ensureSessionAgentHydrated(sessionId)
  return sessions.get(sessionId) ?? null
}

/**
 * 运行用户消息（经 AG-UI runAgent），事件经 emitSessionStream 推送。
 *
 * 同会话同时只允许一次 run；不同会话可并行。
 *
 * @param sessionId - 会话 ID
 * @param userText - 用户输入文本
 * @param options - 发送选项
 */
export async function runUserMessage(
  sessionId: string,
  userText: string,
  options?: AgentSendOptions
): Promise<void> {
  const composerMode = normalizeComposerMode(options?.mode)
  const agentUserText = userText.trim()
  if (!agentUserText) {
    emitPreRunError(sessionId, '消息为空')
    return
  }

  const settings = await getAppSettings()
  agentLog.info(`composerMode: ${composerMode}, settingsKeys: ${Object.keys(settings).join(',')}`)

  let session: SessionRuntime | null
  try {
    session = await ensureRuntimeReady(sessionId)
  } catch {
    emitPreRunError(sessionId, '会话不存在或已过期')
    return
  }

  if (!session) {
    emitPreRunError(sessionId, '会话不存在或已过期')
    return
  }
  if (session.controller) {
    throw new Error('当前会话已有智能体在运行，请等待完成或停止后再发送')
  }

  let workspacePath = options?.workspacePath?.trim() || ''
  if (!workspacePath) {
    try {
      const ws = await getWorkspace(session.workspaceId)
      workspacePath = ws.path?.trim() || ''
    } catch {
      workspacePath = ''
    }
  }
  agentLog.info(`[runUserMessage] workspacePath: ${workspacePath}`)

  if (!workspacePath) {
    emitPreRunError(sessionId, '当前会话未绑定工作区目录，请先绑定路径')
    return
  }

  const provider = resolveChatModel(settings)
  try {
    session.agent.assertReady({ provider })
  } catch (e) {
    emitPreRunError(sessionId, e instanceof Error ? e.message : String(e))
    return
  }

  const editUserOrdinal = options?.editUserOrdinal
  if (typeof editUserOrdinal === 'number' && Number.isFinite(editUserOrdinal)) {
    session.agent.messages = truncateMessagesBeforeUserOrdinal(
      session.agent.messages,
      Math.floor(editUserOrdinal)
    )
    clearSessionWorking(sessionId)
    await persistSessionMessages(sessionId, session.agent.messages)
  }

  const ac = new AbortController()
  session.controller = ac

  const runId = makeRunId()
  const runStartedAt = Date.now()

  const userMessage: Message = {
    id: `u-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role: 'user',
    content: agentUserText
  }
  const fullMessages: Message[] = [...session.agent.messages, userMessage]
  session.agent.messages = fullMessages

  let memoryDroppedPrefix: Message[] = []
  let memorySystemSection: string | undefined
  const memorySummarizer = provider ? createMemorySummarizer(provider) : null
  const prepared = await prepareSessionMemory({
    sessionId,
    messages: fullMessages,
    ...(memorySummarizer ? { summarizer: memorySummarizer } : { refine: false })
  })
  memoryDroppedPrefix = prepared.droppedPrefix
  session.agent.messages = prepared.messages
  memorySystemSection = prepared.systemSection?.trim() || undefined

  const forwardedProps = session.agent.buildRunForwardedProps({
    composerMode,
    abortController: ac,
    workspacePath,
    terminalKey: session.terminalKey,
    provider,
    tavilyApiKey: settings.tavilyApiKey,
    maxSteps: MAX_AGENT_LOOP_STEPS,
    invokeTimeoutMs: settings.agentRunTimeoutMs,
    ...(memorySystemSection ? { memorySystemSection } : {}),
    ...(composerMode === 'build' && options?.planMarkdown?.trim()
      ? { planMarkdown: options.planMarkdown.trim() }
      : {})
  })

  /**
   * 将 compact 丢弃的前缀拼回 run 后的 messages。
   *
   * @param runMessages - runAgent 之后的 agent.messages
   * @returns 完整 AG-UI 消息列表
   */
  const restoreFullMessages = (runMessages: Message[]): Message[] => {
    if (memoryDroppedPrefix.length === 0) return runMessages
    return [...memoryDroppedPrefix, ...runMessages]
  }

  try {
    agentLog.info(
      `[runUserMessage] run-start: ${runId}, sessionId: ${sessionId}, timestampMs: ${runStartedAt}`
    )

    const sub = session.agent.subscribe({
      onEvent: ({ event }) => {
        emitSessionStream({ sessionId, event })
      }
    })
    session.subscription = sub

    await session.agent.runAgent({
      runId,
      tools: [],
      context: [],
      forwardedProps
    })

    const latest = sessions.get(sessionId)
    if (!latest) return
    if (ac.signal.aborted && latest.controller !== null && latest.controller !== ac) return

    latest.agent.messages = restoreFullMessages(latest.agent.messages)
    await persistSessionMessages(sessionId, latest.agent.messages)

    if (memorySummarizer) {
      void refreshUserProfileFromMessages({
        messages: latest.agent.messages,
        summarizer: memorySummarizer
      })
    }
  } catch (e) {
    const latest = sessions.get(sessionId)
    if (ac.signal.aborted) {
      if (!latest || (latest.controller !== null && latest.controller !== ac)) return
      latest.agent.messages = restoreFullMessages(latest.agent.messages)
      await persistSessionMessages(sessionId, latest.agent.messages)
      return
    }
    const message = e instanceof Error ? e.message : String(e)
    const err: RunErrorEvent = {
      type: EventType.RUN_ERROR,
      message,
      code: 'ERROR',
      timestamp: Date.now()
    }
    emitSessionStream({ sessionId, event: err })

    if (latest) {
      latest.agent.messages = restoreFullMessages(latest.agent.messages)
      await persistSessionMessages(sessionId, latest.agent.messages)
    }
  } finally {
    const latest = sessions.get(sessionId)
    if (latest && latest.controller === ac) {
      latest.subscription?.unsubscribe()
      latest.controller = null
      latest.subscription = null
    }
  }
}
