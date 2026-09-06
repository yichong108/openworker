import type { BaseEvent } from '@ag-ui/client'
import { App as AntdApp } from 'antd'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent
} from 'react'

import { aguiEventsToToolTimeline } from './agui-timeline.js'
import { MessageTurnItem } from './MessageTurnItem.js'
import { buildMessageTurns, type MessageTurn } from './session-utils.js'
import type { ChatSessionMessage, ChatSessionRunStats } from './types.js'

export type ChatMessageListProps = {
  /** 会话切换键，用于重置滚动状态 */
  sessionKey?: string | null
  messages: ChatSessionMessage[]
  /** 本轮尚未落盘的 AG-UI 事件（由本组件派生为直播时间线） */
  liveEvents: BaseEvent[]
  isRun: boolean
  runStats?: ChatSessionRunStats
  onStopRun: () => void
  onEditResend: (messageId: string, text: string) => void | Promise<void>
  onOpenExternal: (href: string) => Promise<{ ok: boolean }>
}

/** 找到最近的可滚动祖先（用于从 .ow-ui-chat-session-content-inner 向上找到 .ow-ui-chat-session-content） */
function findScrollableAncestor(start: HTMLElement | null): HTMLElement | null {
  let el: HTMLElement | null = start
  while (el) {
    const style = window.getComputedStyle(el)
    const overflowY = style.overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') return el
    el = el.parentElement
  }
  return null
}

/**
 * 管理消息列表区的展示状态：时间线手风琴、自动滚动、Markdown 外链确认等。
 *
 * 滚动容器已上移到宿主层（`.ow-ui-chat-session-content`），本组件通过向上查找祖先来监听滚动。
 *
 * @param options - 会话消息与直播 AG-UI 事件
 */
function useChatMessageList({
  sessionKey,
  messages,
  liveEvents,
  isRun,
  runStats,
  onOpenExternal
}: ChatMessageListProps) {
  const { message: msgApi, modal: modalApi } = AntdApp.useApp()

  const [timelineOpenOverride, setTimelineOpenOverride] = useState<Record<string, boolean>>({})
  const shellRef = useRef<HTMLDivElement | null>(null)
  const messagesBottomRef = useRef<HTMLDivElement | null>(null)
  const autoScrollRef = useRef(true)
  const [liveTick, setLiveTick] = useState(0)

  const liveTimeline = useMemo(
    () =>
      aguiEventsToToolTimeline(liveEvents, {
        runId: runStats?.runId,
        traceId: runStats?.traceId
      }),
    [liveEvents, runStats?.runId, runStats?.traceId]
  )

  const messageTurns: MessageTurn[] = useMemo(() => buildMessageTurns(messages), [messages])

  const latestAssistantMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i]
      if (msg?.role === 'assistant') return msg.id
    }
    return null
  }, [messages])

  const latestUserMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i]
      if (msg?.role === 'user') return msg.id
    }
    return null
  }, [messages])

  const isNearBottom = useCallback((el: HTMLElement) => {
    const threshold = 48
    return el.scrollTop + el.clientHeight >= el.scrollHeight - threshold
  }, [])

  const scrollMessagesToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const bottomEl = messagesBottomRef.current
    if (bottomEl) {
      bottomEl.scrollIntoView({ block: 'end', behavior })
    }
  }, [])

  useEffect(() => {
    if (!isRun) return
    const id = window.setInterval(() => setLiveTick((n) => n + 1), 500)
    return () => window.clearInterval(id)
  }, [isRun])

  const timelineWallMs = useMemo(() => {
    const started = runStats?.startedAt
    if (isRun && started != null) return Math.max(0, Date.now() - started + liveTick * 0)
    if (runStats?.durationMs != null && runStats.durationMs >= 0) {
      return runStats.durationMs
    }
    return 0
  }, [runStats, isRun, liveTick])

  const openExternalWithConfirm = useCallback(
    (href: string) => {
      const target = (() => {
        try {
          const parsed = new URL(href)
          return parsed.host || href
        } catch {
          return href
        }
      })()
      modalApi.confirm({
        title: '即将打开外部链接',
        content: `目标地址：${target}`,
        centered: true,
        okText: '继续打开',
        cancelText: '取消',
        onOk: async () => {
          const r = await onOpenExternal(href)
          if (!r.ok) msgApi.warning('打开链接失败')
        }
      })
    },
    [modalApi, msgApi, onOpenExternal]
  )

  const onMarkdownClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null
      const anchor = target?.closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href') ?? ''
      if (!/^(https?:|mailto:)/i.test(href)) return
      event.preventDefault()
      openExternalWithConfirm(href)
    },
    [openExternalWithConfirm]
  )

  /** 向上查找宿主滚动容器，监听 scroll 事件以更新 autoScrollRef */
  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    const scrollContainer = findScrollableAncestor(shell)
    if (!scrollContainer) return
    const handler = () => {
      autoScrollRef.current = isNearBottom(scrollContainer)
    }
    scrollContainer.addEventListener('scroll', handler, { passive: true })
    return () => scrollContainer.removeEventListener('scroll', handler)
  }, [isNearBottom, sessionKey])

  useLayoutEffect(() => {
    autoScrollRef.current = true
    scrollMessagesToBottom('auto')
  }, [sessionKey, scrollMessagesToBottom])

  useLayoutEffect(() => {
    if (!autoScrollRef.current) return
    const rafId = window.requestAnimationFrame(() => {
      scrollMessagesToBottom('auto')
      window.requestAnimationFrame(() => {
        if (autoScrollRef.current) scrollMessagesToBottom('auto')
      })
    })
    return () => window.cancelAnimationFrame(rafId)
  }, [messages, liveTimeline, scrollMessagesToBottom])

  return {
    messageTurns,
    latestAssistantMessageId,
    latestUserMessageId,
    timelineOpenOverride,
    setTimelineOpenOverride,
    timelineWallMs,
    shellRef,
    messagesBottomRef,
    autoScrollRef,
    onMarkdownClick,
    isRun,
    liveTimeline
  }
}

/**
 * 会话消息列表：纯内容容器，滚动交给宿主层（`.ow-ui-chat-session-content`）。
 *
 * @param props - 当前会话消息与直播 AG-UI 事件
 */
export function ChatMessageList(props: ChatMessageListProps) {
  const m = useChatMessageList(props)

  return (
    <div className="ow-ui-chat-session-messages-shell" ref={m.shellRef}>
      <div className="ow-ui-chat-session-messages-inner">
        {m.messageTurns.map((turn) => (
          <MessageTurnItem
            key={turn.key}
            turn={turn}
            latestAssistantMessageId={m.latestAssistantMessageId}
            latestUserMessageId={m.latestUserMessageId}
            isRun={m.isRun}
            currentTimeline={m.liveTimeline}
            timelineOpenOverride={m.timelineOpenOverride}
            setTimelineOpenOverride={m.setTimelineOpenOverride}
            timelineWallMs={m.timelineWallMs}
            onMarkdownClick={m.onMarkdownClick}
            onStopRun={props.onStopRun}
            onEditResend={props.onEditResend}
          />
        ))}
        <div ref={m.messagesBottomRef} />
      </div>
    </div>
  )
}
