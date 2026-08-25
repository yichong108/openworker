import { aguiEventsToToolTimeline } from './agui-timeline.js'
import type { ChatSessionMessage } from './types.js'
import type { ToolTimelineEvent } from '@openworker/shared'

/**
 * 根据消息与会话上下文计算助手消息的展示时间线。
 *
 * 历史消息：从落盘的 AG-UI 事件在渲染层派生；进行中：使用 liveTimeline。
 *
 * @param message - 当前消息
 * @param latestAssistantId - 最新 assistant 消息 id
 * @param isRun - 会话是否正在 run
 * @param liveTimeline - 直播时间线（已由 AG-UI 派生）
 * @returns 展示用 ToolTimelineEvent
 */
export function assistantDisplayTimeline(
  message: ChatSessionMessage,
  latestAssistantId: string | null,
  isRun: boolean,
  liveTimeline: ToolTimelineEvent[]
): ToolTimelineEvent[] {
  if (message.role !== 'assistant') return []
  if (message.id === latestAssistantId && isRun) return liveTimeline
  if (message.aguiEvents && message.aguiEvents.length > 0) {
    return aguiEventsToToolTimeline(message.aguiEvents)
  }
  if (message.id === latestAssistantId && liveTimeline.length > 0) return liveTimeline
  return []
}

/**
 * Worked / Thought 标题用中文耗时文案。
 *
 * @param ms - 耗时毫秒
 * @returns 如「24 秒」「1 分 2 秒」（秒为整数，不含小数）
 */
export function formatWorkedDurationZh(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0 秒'
  const sec = Math.max(1, Math.round(ms / 1000))
  if (sec < 60) return `${sec} 秒`
  const m = Math.floor(sec / 60)
  const rs = sec % 60
  if (m < 60) return rs > 0 ? `${m} 分 ${rs} 秒` : `${m} 分`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm > 0 ? `${h} 小时 ${rm} 分` : `${h} 小时`
}

export type MessageTurn = {
  /** 消息组 ID */
  key: string
  /** 消息列表 */
  messages: ChatSessionMessage[]
}

/**
 * 将消息转换为消息回合（一轮用户消息和一轮 assistant 消息算作一个回合）。
 *
 * 将线性数组归类为回合数组，每个回合包含多个消息。
 *
 * @param messages - 消息
 * @returns 消息回合
 */
export function buildMessageTurns(messages: ChatSessionMessage[]): MessageTurn[] {
  const turns: MessageTurn[] = []
  let batch: ChatSessionMessage[] = []

  const flush = () => {
    if (batch.length === 0) return
    turns.push({ key: batch[0]!.id, messages: batch })
    batch = []
  }

  for (const m of messages) {
    if (m.role === 'user') {
      flush()
      batch = [m]
    } else if (batch.length === 0) {
      batch = [m]
    } else {
      batch.push(m)
    }
  }
  flush()
  return turns
}

/**
 * 读取 antd TextArea 底层 textarea（兼容 InputRef 形态差异）。
 *
 * @param inputRef - antd Input/TextArea ref 的 current
 * @returns HTMLTextAreaElement 或 null
 */
export function getComposerTextarea(
  inputRef: {
    input?: HTMLInputElement | null
    resizableTextArea?: { textArea?: HTMLTextAreaElement } | null
    nativeElement?: HTMLElement | null
  } | null
): HTMLTextAreaElement | null {
  if (!inputRef) return null
  const fromResizable = inputRef.resizableTextArea?.textArea
  if (fromResizable) return fromResizable
  if (inputRef.input instanceof HTMLTextAreaElement) return inputRef.input
  const native = inputRef.nativeElement
  if (native instanceof HTMLTextAreaElement) return native
  const nested = native?.querySelector?.('textarea')
  return nested instanceof HTMLTextAreaElement ? nested : null
}
