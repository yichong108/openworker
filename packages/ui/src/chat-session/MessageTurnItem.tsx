import { RightOutlined, StopOutlined } from '@ant-design/icons'
import type { ToolCallEvent, ToolTimelineEvent } from '@openworker/shared'
import { App as AntdApp, Button, Card, Dropdown, Input, Typography, type MenuProps } from 'antd'
import type { InputRef } from 'antd/es/input'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { FileEditDiff } from '../diff/index.js'
import { Markdown, MarkdownCopyButton } from '../markdown/index.js'
import { resolveFileEditDiff } from './file-edit-diff.js'
import {
  assistantDisplayTimeline,
  formatWorkedDurationZh,
  getComposerTextarea,
  type MessageTurn
} from './session-utils.js'
import type { ChatSessionMessage } from './types.js'
import {
  estimateTimelineDurationMs,
  formatAtomicToolTitle,
  formatEditTitle,
  formatExploredTitle,
  formatMcpTitle,
  formatShellTitle,
  formatThoughtTitle,
  groupWorkedTimeline,
  isBriefThought,
  type WorkedChild,
  type WorkedNode
} from './worked-timeline.js'

const { Text } = Typography

export type MessageTurnItemProps = {
  /** 单个消息回合（用户消息及其后的 assistant 回复等） */
  turn: MessageTurn
  /** 当前会话最新 assistant 消息 id，用于时间线与流式态判定 */
  latestAssistantMessageId: string | null
  /** 当前会话最新用户消息 id，用于在运行中展示停止按钮 */
  latestUserMessageId: string | null
  /** 当前会话是否正在执行 */
  isRun: boolean
  /** 当前会话的工具时间线 */
  currentTimeline: ToolTimelineEvent[]
  /** 工具时间线手风琴展开状态覆盖表，key 为 assistant message id */
  timelineOpenOverride: Record<string, boolean>
  /** 更新工具时间线手风琴展开状态 */
  setTimelineOpenOverride: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  /** 当前运行耗时（毫秒），用于时间线标题展示 */
  timelineWallMs: number
  /** Markdown 区域点击外链时的确认处理 */
  onMarkdownClick: (event: React.MouseEvent<HTMLDivElement>) => void
  /** 停止当前会话进行中的智能体运行 */
  onStopRun: () => void
  /**
   * 重新编辑用户消息并从此处重发（截断后续回合）。
   *
   * @param messageId - 用户消息 id
   * @param text - 编辑后的文本
   */
  onEditResend: (messageId: string, text: string) => void | Promise<void>
}

/** 单条消息卡片渲染所需的会话级上下文 */
type MessageCardContext = Pick<
  MessageTurnItemProps,
  | 'latestAssistantMessageId'
  | 'latestUserMessageId'
  | 'isRun'
  | 'currentTimeline'
  | 'timelineOpenOverride'
  | 'setTimelineOpenOverride'
  | 'timelineWallMs'
  | 'onMarkdownClick'
  | 'onStopRun'
  | 'onEditResend'
>

/** 单条消息的派生展示状态，将分支判断集中在 JSX 之外 */
type MessageCardView = {
  isLatestAssistant: boolean
  isStreaming: boolean
  worked: WorkedNode
  wallMs: number
  timelineExpanded: boolean
  showWorkedAccordion: boolean
  contentPlaceholder: string
}

/**
 * 根据消息与会话上下文计算单条消息的展示派生状态。
 *
 * @param msg - 当前消息
 * @param ctx - 会话级展示上下文
 * @returns 供子组件使用的只读视图模型
 */
function buildMessageCardView(msg: ChatSessionMessage, ctx: MessageCardContext): MessageCardView {
  const isLatestAssistant = msg.role === 'assistant' && msg.id === ctx.latestAssistantMessageId
  const isStreaming = msg.streaming ?? Boolean(ctx.isRun && isLatestAssistant)
  const displayTimeline = assistantDisplayTimeline(
    msg,
    ctx.latestAssistantMessageId,
    isStreaming,
    ctx.currentTimeline
  )
  const worked = groupWorkedTimeline(displayTimeline)
  // 有过程事件，或当前 run 中的最新 assistant：显示 Worked（过程可追溯）
  const showWorkedAccordion =
    worked.children.length > 0 || (isLatestAssistant && Boolean(ctx.isRun))
  const timelineExpanded =
    ctx.timelineOpenOverride[msg.id] !== undefined
      ? ctx.timelineOpenOverride[msg.id]!
      : Boolean(ctx.isRun)

  const estimatedMs = estimateTimelineDurationMs(displayTimeline)
  const wallMs =
    isLatestAssistant && (ctx.isRun || ctx.timelineWallMs > 0)
      ? ctx.timelineWallMs
      : (estimatedMs ?? ctx.timelineWallMs)

  return {
    isLatestAssistant,
    isStreaming,
    worked,
    wallMs,
    timelineExpanded,
    showWorkedAccordion,
    contentPlaceholder: isStreaming ? '…' : ''
  }
}

type NestedAccordionProps = {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
  className?: string
}

/**
 * Worked 内二级手风琴（Thought / Explored 等）。
 *
 * 默认折叠；展开后显示 L3 原子步骤或思考正文。
 */
function NestedAccordion({
  title,
  defaultOpen = false,
  children,
  className
}: NestedAccordionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`app-worked-l2${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className="app-worked-l2-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="app-worked-l2-title">{title}</span>
        <RightOutlined className={`app-timeline-chevron${open ? ' is-open' : ''}`} />
      </button>
      {open ? <div className="app-worked-l2-body">{children}</div> : null}
    </div>
  )
}

type AtomicToolRowProps = {
  event: ToolCallEvent
}

/** Explored 内的 L3 原子工具行 */
function AtomicToolRow({ event }: AtomicToolRowProps) {
  const [open, setOpen] = useState(false)
  const hasDetail = Boolean(event.args || (event.status === 'end' && event.result))
  const title = formatAtomicToolTitle(event)

  if (!hasDetail) {
    return (
      <div className="app-worked-l3-item">
        <span className="app-worked-l3-title">{title}</span>
      </div>
    )
  }

  return (
    <div className="app-worked-l3-item">
      <button
        type="button"
        className="app-worked-l3-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="app-worked-l3-title">{title}</span>
        <RightOutlined className={`app-timeline-chevron${open ? ' is-open' : ''}`} />
      </button>
      {open ? (
        <div className="app-worked-l3-body">
          {event.args ? <div className="app-worked-args">{event.args}</div> : null}
          {event.status === 'end' && event.result ? (
            <pre className="app-timeline-result">{event.result}</pre>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

type ToolLeafRowProps = {
  title: string
  event: ToolCallEvent
  defaultOpen?: boolean
}

/** Shell / Edit / MCP / 通用工具：Worked 下的 L2 叶子（可展开看输出） */
function ToolLeafRow({ title, event, defaultOpen = false }: ToolLeafRowProps) {
  const [open, setOpen] = useState(defaultOpen)
  const hasDetail = Boolean(event.args || (event.status === 'end' && event.result))

  return (
    <div className="app-worked-l2">
      <button
        type="button"
        className="app-worked-l2-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        disabled={!hasDetail}
      >
        <span className="app-worked-l2-title">{title}</span>
        <RightOutlined
          className={`app-timeline-chevron${open ? ' is-open' : ''}${hasDetail ? '' : ' is-hidden'}`}
        />
      </button>
      {open && hasDetail ? (
        <div className="app-worked-l2-body">
          {event.args ? <div className="app-worked-args">{event.args}</div> : null}
          {event.status === 'end' && event.result ? (
            <pre className="app-timeline-result">{event.result}</pre>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

type EditToolLeafRowProps = {
  title: string
  event: ToolCallEvent
}

/**
 * 编辑类工具叶子：展开时优先渲染文件 diff；无法解析时回退到通用 ToolLeafRow。
 *
 * @param title - 二级标题
 * @param event - write_file / delete_file 事件
 */
function EditToolLeafRow({ title, event }: EditToolLeafRowProps) {
  const [open, setOpen] = useState(false)
  const diffView = useMemo(
    () => resolveFileEditDiff(event.name, event.args, event.result),
    [event.name, event.args, event.result]
  )
  const hasDetail = Boolean(diffView || event.args || (event.status === 'end' && event.result))

  if (!diffView) {
    return <ToolLeafRow title={title} event={event} />
  }

  return (
    <div className="app-worked-l2">
      <button
        type="button"
        className="app-worked-l2-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        disabled={!hasDetail}
      >
        <span className="app-worked-l2-title">{title}</span>
        <RightOutlined
          className={`app-timeline-chevron${open ? ' is-open' : ''}${hasDetail ? '' : ' is-hidden'}`}
        />
      </button>
      {open && hasDetail ? (
        <div className="app-worked-l2-body">
          <FileEditDiff view={diffView} />
        </div>
      ) : null}
    </div>
  )
}

/**
 * Thought 行：对齐 Cursor——标签 +（可选）正文，不是二级手风琴。
 *
 * - 略作思考：仅一行灰字标题
 * - 较长思考：标题「思考 · N 秒」+ 正文始终可见（随 Worked 展开）
 */
function ThoughtRow({ child }: { child: Extract<WorkedChild, { kind: 'thought' }> }) {
  const title = formatThoughtTitle(child)
  const brief = isBriefThought(child)
  const text = child.text.trim()

  return (
    <div className={`app-worked-thought${brief ? ' is-brief' : ''}`}>
      <div className="app-worked-thought-label">{title}</div>
      {text ? <div className="app-worked-thought-text">{text}</div> : null}
    </div>
  )
}

/**
 * 渲染单个 Worked L2 子节点。
 *
 * Thought 为静态标签块；Explored 为可折叠组；Shell/Edit/MCP 为可展开叶子。
 */
function WorkedChildNode({ child }: { child: WorkedChild }) {
  if (child.kind === 'thought') {
    return <ThoughtRow child={child} />
  }

  if (child.kind === 'explored') {
    return (
      <NestedAccordion title={formatExploredTitle(child.tools)}>
        {child.tools.map((tool) => (
          <AtomicToolRow key={tool.id} event={tool} />
        ))}
      </NestedAccordion>
    )
  }

  if (child.kind === 'shell') {
    return <ToolLeafRow title={formatShellTitle(child.event)} event={child.event} />
  }

  if (child.kind === 'edit') {
    return <EditToolLeafRow title={formatEditTitle(child.event)} event={child.event} />
  }

  if (child.kind === 'mcp') {
    return <ToolLeafRow title={formatMcpTitle(child.event)} event={child.event} />
  }

  if (child.kind === 'error') {
    return (
      <div className="app-worked-l2 app-worked-error">
        <Text type="danger">{child.event.message}</Text>
      </div>
    )
  }

  return <ToolLeafRow title={child.event.name} event={child.event} />
}

type WorkedAccordionProps = {
  expanded: boolean
  wallMs: number
  worked: WorkedNode
  onToggle: () => void
}

/**
 * Worked（L1）手风琴：本轮干活过程总容器。
 *
 * 默认视图只显示一行摘要；展开后展示 Thought / Explored / Shell / Edit 等 L2。
 * 最终回答（Result）与此并列，由外层 Markdown 渲染。
 */
function WorkedAccordion({ expanded, wallMs, worked, onToggle }: WorkedAccordionProps) {
  // 对齐 Cursor「Worked for 25s」：标题以耗时为主，步骤数过密时不抢视线
  const title = `已工作 · ${formatWorkedDurationZh(wallMs)}`

  return (
    <div className="app-timeline-accordion app-worked-accordion">
      <button
        type="button"
        className="app-timeline-accordion-head"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="app-timeline-accordion-title">{title}</span>
        <RightOutlined className={`app-timeline-chevron${expanded ? ' is-open' : ''}`} />
      </button>
      {expanded ? (
        <div className="app-timeline-wrap app-worked-children">
          {worked.children.length === 0 ? (
            <Text type="secondary">进行中…</Text>
          ) : (
            worked.children.map((child) => <WorkedChildNode key={child.id} child={child} />)
          )}
        </div>
      ) : null}
    </div>
  )
}

type AssistantMessageBodyProps = {
  msg: ChatSessionMessage
  view: MessageCardView
  ctx: MessageCardContext
}

/** assistant 消息正文：Worked（过程）+ Result（Markdown）；回复完成后右下角常显复制 */
function AssistantMessageBody({ msg, view, ctx }: AssistantMessageBodyProps) {
  const { message: msgApi } = AntdApp.useApp()
  const markdownContent = msg.content || view.contentPlaceholder
  const showContentCopy = !view.isStreaming && Boolean(msg.content?.trim())

  return (
    <>
      {view.showWorkedAccordion ? (
        <WorkedAccordion
          expanded={view.timelineExpanded}
          wallMs={view.wallMs}
          worked={view.worked}
          onToggle={() =>
            ctx.setTimelineOpenOverride((prev) => ({
              ...prev,
              [msg.id]: !view.timelineExpanded
            }))
          }
        />
      ) : null}
      <div className="app-message-markdown-wrap">
        <Markdown
          content={markdownContent}
          onClick={ctx.onMarkdownClick}
          onCopyEmpty={() => msgApi.warning('没有可复制的代码')}
          onCopyError={() => msgApi.error('复制失败，请手动选择文本复制')}
        />
        {showContentCopy ? (
          <div className="app-message-markdown-actions">
            <MarkdownCopyButton
              text={msg.content}
              copyLabel="复制回复"
              onCopyEmpty={() => msgApi.warning('没有可复制的内容')}
              onCopyError={() => msgApi.error('复制失败，请手动选择文本复制')}
            />
          </div>
        ) : null}
      </div>
    </>
  )
}

type UserMessageCardProps = {
  msg: ChatSessionMessage
  ctx: MessageCardContext
}

/**
 * 用户消息卡片：默认只展示正文；左键点击进入就地编辑；右键菜单可复制提示词；运行中可停止。
 *
 * @param props.msg - 用户消息
 * @param props.ctx - 会话级操作与展示上下文
 */
function UserMessageCard({ msg, ctx }: UserMessageCardProps) {
  const { message: msgApi } = AntdApp.useApp()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(msg.content)
  const [submitting, setSubmitting] = useState(false)
  const editInputRef = useRef<InputRef>(null)
  const isLatestUser = msg.id === ctx.latestUserMessageId
  const showStop = Boolean(ctx.isRun && isLatestUser)
  const canEdit = !ctx.isRun

  useEffect(() => {
    if (!editing) setDraft(msg.content)
  }, [editing, msg.content])

  useEffect(() => {
    if (ctx.isRun && editing) setEditing(false)
  }, [ctx.isRun, editing])

  useEffect(() => {
    if (!editing) return
    const id = window.requestAnimationFrame(() => {
      const input = editInputRef.current
      input?.focus({ preventScroll: true })
      const textarea = getComposerTextarea(input)
      if (!textarea) return
      const end = textarea.value.length
      textarea.setSelectionRange(end, end)
    })
    return () => window.cancelAnimationFrame(id)
  }, [editing])

  const beginEdit = useCallback(() => {
    if (!canEdit || submitting) return
    setDraft(msg.content)
    setEditing(true)
  }, [canEdit, msg.content, submitting])

  const cancelEdit = useCallback(() => {
    setDraft(msg.content)
    setEditing(false)
  }, [msg.content])

  const submitEdit = useCallback(async () => {
    const next = draft.trim()
    if (!next || submitting) return
    setSubmitting(true)
    try {
      await ctx.onEditResend(msg.id, next)
      setEditing(false)
    } finally {
      setSubmitting(false)
    }
  }, [ctx, draft, msg.id, submitting])

  /**
   * 复制当前用户消息正文（提示词）到剪贴板。
   */
  const copyPrompt = useCallback(async () => {
    const value = msg.content.trim()
    if (!value) {
      msgApi.warning('没有可复制的内容')
      return
    }
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      msgApi.error('复制失败，请手动选择文本复制')
    }
  }, [msg.content, msgApi])

  const contextMenuItems = useMemo<MenuProps['items']>(
    () => [
      {
        key: 'copy-prompt',
        label: '复制提示词',
        onClick: ({ domEvent }) => {
          domEvent.preventDefault()
          domEvent.stopPropagation()
          void copyPrompt()
        }
      }
    ],
    [copyPrompt]
  )

  if (editing) {
    return (
      <div className="app-message-sticky-prompt">
        <Card size="small" variant="outlined" className="app-message-card is-user is-editing">
          <Input.TextArea
            ref={editInputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoSize={{ minRows: 1, maxRows: 16 }}
            variant="borderless"
            className="app-message-user-edit-input"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                cancelEdit()
                return
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void submitEdit()
              }
            }}
          />
          <div className="app-message-user-actions is-editing">
            <Button size="small" onClick={cancelEdit} disabled={submitting}>
              取消
            </Button>
            <Button
              size="small"
              type="primary"
              onClick={() => void submitEdit()}
              disabled={!draft.trim() || submitting}
              loading={submitting}
            >
              发送
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="app-message-sticky-prompt">
      <Dropdown menu={{ items: contextMenuItems }} trigger={['contextMenu']}>
        <Card
          size="small"
          variant="outlined"
          className={`app-message-card is-user${canEdit ? ' is-editable' : ''}`}
          onClick={(e) => {
            // 仅左键进入编辑；右键由上下文菜单处理，不进入编辑模式
            if (e.button !== 0) return
            if (!canEdit) return
            beginEdit()
          }}
          onContextMenu={(e) => {
            // 阻止右键冒泡到可能触发编辑的逻辑；菜单由 Dropdown 打开
            e.stopPropagation()
          }}
          role={canEdit ? 'button' : undefined}
          tabIndex={canEdit ? 0 : undefined}
          onKeyDown={
            canEdit
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    beginEdit()
                  }
                }
              : undefined
          }
        >
          <div className="app-message-content">{msg.content}</div>
          {showStop ? (
            <div className="app-message-user-actions">
              <button
                type="button"
                className="app-message-user-action-btn is-stop"
                onClick={(e) => {
                  e.stopPropagation()
                  ctx.onStopRun()
                }}
                aria-label="停止"
                title="停止"
              >
                <StopOutlined />
                <span>停止</span>
              </button>
            </div>
          ) : null}
        </Card>
      </Dropdown>
    </div>
  )
}

type MessageCardProps = {
  msg: ChatSessionMessage
  ctx: MessageCardContext
}

/** 单条消息卡片：用户消息支持停止/编辑，assistant 走专用正文组件 */
function MessageCard({ msg, ctx }: MessageCardProps) {
  if (msg.role === 'user') {
    return <UserMessageCard msg={msg} ctx={ctx} />
  }

  const view = buildMessageCardView(msg, ctx)

  return (
    <Card size="small" variant="borderless" className="app-message-card is-assistant">
      <div className="app-message-content">
        <AssistantMessageBody msg={msg} view={view} ctx={ctx} />
      </div>
    </Card>
  )
}

/**
 * 渲染单个消息回合：包含该回合内所有消息卡片（用户 / assistant、Worked/Result 等）。
 *
 * 从 `ChatMessageList` 抽离，便于独立维护单回合 UI 与后续 memo 优化。
 *
 * @param props - 回合数据与会话级展示状态
 */
export function MessageTurnItem(props: MessageTurnItemProps) {
  const { turn, ...ctx } = props

  return (
    <div className="app-message-turn">
      {turn.messages.map((msg) => (
        <MessageCard key={msg.id} msg={msg} ctx={ctx} />
      ))}
    </div>
  )
}
