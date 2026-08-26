import type { BaseEvent } from '@ag-ui/client'

/** 对话角色 */
export type ChatRole = 'user' | 'assistant' | 'system'

/** 一条聊天气泡（对齐 ChatSessionMessage） */
export type ChatMessage = {
  id: string
  role: ChatRole
  content: string
  aguiEvents?: BaseEvent[]
  streaming?: boolean
}

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
  messages: ChatMessage[]
  liveEvents: BaseEvent[]
  runStats?: ChatRunStats
}
