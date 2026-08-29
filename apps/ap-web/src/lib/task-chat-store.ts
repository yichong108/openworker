import type { ChatTranscript, TaskChatHint } from '@/components/chat/chat-types'

import { chatTranscriptHint } from './agui-message'
import { readTaskChatFile } from './task-chat-fs'

type TaskChatStoreCore = {
  transcripts: Map<string, ChatTranscript>
  hydratedFiles: Set<string>
  hintListeners: Set<(payload: Record<string, TaskChatHint>) => void>
  hintTimer: ReturnType<typeof setTimeout> | undefined
  messageSeq: number
}

const GLOBAL_KEY = '__apWebTaskChatCore'

function getCore(): TaskChatStoreCore {
  const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: TaskChatStoreCore }
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      transcripts: new Map(),
      hydratedFiles: new Set(),
      hintListeners: new Set(),
      hintTimer: undefined,
      messageSeq: 0
    }
  }
  return g[GLOBAL_KEY]
}

function emptyTranscript(): ChatTranscript {
  return { running: false, started: false, messages: [], liveEvents: [] }
}

function hydrateFromDisk(fileName: string): void {
  const core = getCore()
  if (core.hydratedFiles.has(fileName) || core.transcripts.has(fileName)) {
    core.hydratedFiles.add(fileName)
    return
  }
  core.hydratedFiles.add(fileName)
  const fromDisk = readTaskChatFile(fileName)
  if (fromDisk.length === 0) return
  core.transcripts.set(fileName, {
    running: false,
    started: true,
    messages: fromDisk,
    liveEvents: []
  })
}

/**
 * 生成会话消息 id。
 */
export function nextChatMessageId(): string {
  const core = getCore()
  core.messageSeq += 1
  return `m${core.messageSeq}`
}

/**
 * 获取或创建内存 transcript，必要时从磁盘 hydrate。
 */
export function getOrCreateTranscript(fileName: string): ChatTranscript {
  hydrateFromDisk(fileName)
  const core = getCore()
  const current = core.transcripts.get(fileName)
  if (current) return current
  const created = emptyTranscript()
  core.transcripts.set(fileName, created)
  return created
}

/**
 * 局部更新 transcript 并通知 hint 订阅者。
 */
export function patchTranscript(fileName: string, partial: Partial<ChatTranscript>): void {
  const current = getOrCreateTranscript(fileName)
  const prevRunning = current.running
  const prevError = current.error
  const prevStarted = current.started
  const core = getCore()
  core.transcripts.set(fileName, {
    ...current,
    ...partial,
    messages: partial.messages ?? current.messages,
    liveEvents: partial.liveEvents ?? current.liveEvents,
    assistantEvents: partial.assistantEvents ?? current.assistantEvents
  })
  const next = core.transcripts.get(fileName)!
  const statusChanged =
    next.running !== prevRunning || next.error !== prevError || next.started !== prevStarted
  notifyTaskChatHints(statusChanged)
}

/**
 * 当前全部任务的卡片 hint。
 */
export function listTaskChatHints(): Record<string, TaskChatHint> {
  const core = getCore()
  const out: Record<string, TaskChatHint> = {}
  for (const [fileName, transcript] of core.transcripts) {
    out[fileName] = chatTranscriptHint(transcript)
  }
  return out
}

function flushHints(): void {
  const core = getCore()
  if (core.hintTimer) {
    clearTimeout(core.hintTimer)
    core.hintTimer = undefined
  }
  const payload = listTaskChatHints()
  for (const listener of core.hintListeners) {
    listener(payload)
  }
}

/**
 * 广播卡片 hint。running/error 变化立刻推；正文预览节流。
 */
export function notifyTaskChatHints(immediate = false): void {
  const core = getCore()
  if (immediate) {
    flushHints()
    return
  }
  if (core.hintTimer) return
  core.hintTimer = setTimeout(() => {
    core.hintTimer = undefined
    flushHints()
  }, 100)
}

/**
 * 订阅卡片 hint（看板 SSE）。
 */
export function subscribeTaskChatHints(
  listener: (payload: Record<string, TaskChatHint>) => void
): () => void {
  const core = getCore()
  core.hintListeners.add(listener)
  return () => {
    core.hintListeners.delete(listener)
  }
}

/**
 * 确保 transcript 已从磁盘 hydrate。
 */
export function hydrateTaskChatTranscript(fileName: string): ChatTranscript {
  return getOrCreateTranscript(fileName)
}

/**
 * 从内存去掉该任务会话 transcript。
 */
export function forgetTaskChatTranscript(fileName: string): void {
  const core = getCore()
  core.transcripts.delete(fileName)
  core.hydratedFiles.delete(fileName)
  notifyTaskChatHints(true)
}

/**
 * 读取 transcript 快照（不创建）。
 */
export function getTranscript(fileName: string): ChatTranscript | undefined {
  return getCore().transcripts.get(fileName)
}
