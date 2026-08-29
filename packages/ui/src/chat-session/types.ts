import type { BaseEvent } from '@ag-ui/client'
import type { AgentComposerMode } from '@openworker/shared'
import type { ReactNode } from 'react'

/** 会话消息角色 */
export type ChatSessionRole = 'user' | 'assistant' | 'system'

/**
 * 聊天会话视图中的单条消息。
 *
 * `content` 由宿主折叠 TEXT_MESSAGE_CONTENT / openworker.text.delta 后传入；
 * `aguiEvents` 为该条落盘的 AG-UI 时间线源事件。
 */
export type ChatSessionMessage = {
  id: string
  role: ChatSessionRole
  /** 宿主折叠 TEXT_MESSAGE_CONTENT / openworker.text.delta 后的正文 */
  content: string
  /** 本条落盘的 AG-UI 时间线源事件（TOOL_CALL_* / RUN_ERROR / cursor.thinking） */
  aguiEvents?: BaseEvent[]
  /**
   * 本条正在流式输出。省略时由 isRun + 最新 assistant 推导（与 desktop 一致）。
   */
  streaming?: boolean
}

/** 会话运行时序（Worked 耗时心跳） */
export type ChatSessionRunStats = {
  runId?: string
  traceId?: string
  startedAt?: number
  durationMs?: number
}

/** 斜杠技能菜单项 */
export type ChatComposerSkill = {
  name: string
  description: string
  source: string
}

/**
 * 输入区受控属性。斜杠菜单的 token 解析由宿主完成，视图只负责展示与键盘导航。
 */
export type ChatComposerProps = {
  value: string
  /**
   * 输入变化。cursor 为当前 selectionStart，便于宿主同步斜杠技能菜单。
   *
   * @param value - 输入全文
   * @param cursor - 光标位置
   */
  onChange: (value: string, cursor?: number) => void
  /** 发送当前输入（Enter，技能菜单关闭时） */
  onSend: () => void
  /** 停止当前 run；省略时由 ChatSessionView 注入 onStopRun */
  onStop?: () => void
  placeholder?: string
  isRun?: boolean
  /** 有正文且未在跑时可点发送 */
  canSend: boolean
  /** 额外禁用发送（例如未绑定工作区路径） */
  sendDisabled?: boolean
  composerMode: AgentComposerMode
  onComposerModeChange: (mode: AgentComposerMode) => void
  skillMenu?: {
    open: boolean
    skills: ChatComposerSkill[]
    activeIndex: number
    loading?: boolean
    onSelect: (skill: ChatComposerSkill) => void
    onActiveIndexChange: (index: number) => void
    onClose: () => void
  }
}

/** 计划卡片（宿主从 CUSTOM(openworker.plan) 解析后传入，便于编辑） */
export type ChatPlanCardProps = {
  title?: string
  markdown: string
  onMarkdownChange: (markdown: string) => void
  onSave: () => void
  onBuild: () => void
  saving?: boolean
  building?: boolean
  buildDisabled?: boolean
}

/**
 * 中间栏聊天会话视图：消息列表 + 底部输入框 + 加载/计划卡。
 *
 * 对话面吃 AG-UI `BaseEvent`；输入框与计划编辑仍是 UI 插槽。
 */
export type ChatSessionViewProps = {
  isLoading: boolean
  isEmpty: boolean
  messages: ChatSessionMessage[]
  /** 本轮尚未落盘的 AG-UI 事件流，只作用在最新 assistant */
  liveEvents: BaseEvent[]
  isRun: boolean
  runStats?: ChatSessionRunStats
  /**
   * 会话切换键，用于重置滚动贴底。省略时用首条消息 id。
   */
  sessionKey?: string | null
  onStopRun: () => void
  /**
   * 重新编辑用户消息并从此处重发。
   *
   * @param messageId - 用户消息 id
   * @param text - 编辑后的文本
   */
  onEditResend: (messageId: string, text: string) => void | Promise<void>
  /**
   * 用户确认后打开外链。
   *
   * @param href - 链接地址
   */
  onOpenExternal: (href: string) => Promise<{ ok: boolean }>
  emptyToolbar?: ReactNode
  plan?: ChatPlanCardProps | null
  composer: ChatComposerProps
  className?: string
}

/** onRunRequest 传入的消息条目（user / assistant） */
export type ChatSessionRunMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

/**
 * 宿主 run 回调入参：组件只交出消息与取消信号，传输协议由宿主实现。
 *
 * 服务端为真时可不调用 onEvent，改由 snapshot 驱动界面。
 */
export type ChatSessionRunRequest = {
  messages: ChatSessionRunMessage[]
  signal: AbortSignal
  onEvent: (event: BaseEvent) => void
}

/** 服务端会话快照（有则界面跟快照走，不再在本地折叠 AG-UI） */
export type ChatSessionSnapshot = {
  messages: ChatSessionMessage[]
  liveEvents?: BaseEvent[]
  isRun?: boolean
  runStats?: ChatSessionRunStats
}

/**
 * 自包含会话组件：内部管 AG-UI 事件与会话状态，传输层通过回调注入。
 */
export type ChatSessionWithHttpProps = {
  onRunRequest: (request: ChatSessionRunRequest) => void | Promise<void>
  onStopRequest: () => void | Promise<void | { restoredInput?: string }>
  sessionKey?: string | null
  className?: string
  /** 服务端快照；传入后消息/running 以快照为准 */
  snapshot?: ChatSessionSnapshot
  /** 挂载时的历史消息（仅初值，之后由组件内部维护） */
  initialMessages?: ChatSessionMessage[]
  /** 挂载时的未落盘 AG-UI 事件 */
  initialLiveEvents?: BaseEvent[]
  /** 挂载时是否正在 run */
  initialIsRun?: boolean
  /** 挂载时的 run 统计 */
  initialRunStats?: ChatSessionRunStats
}
