import type { BaseEvent, Message } from '@ag-ui/client'

/** 会话运行时序（Worked 耗时心跳） */
export type ChatRunStats = {
  runId?: string
  traceId?: string
  startedAt?: number
  durationMs?: number
}

/** 任务 Agent 会话快照（按任务文件名） */
export type ChatTranscript = {
  running: boolean
  started: boolean
  error?: string
  /** AG-UI 协议消息；气泡由 UI 边界折叠 */
  messages: Message[]
  liveEvents: BaseEvent[]
  /** 已结束回合挂在 assistant id 上的时间线源事件（不落盘） */
  assistantEvents?: Record<string, BaseEvent[]>
  runStats?: ChatRunStats
}

/** 看板卡片上的对话按钮状态（瘦，不含整段 messages） */
export type TaskChatHint = {
  running: boolean
  started: boolean
  error?: string
  preview: string
}
