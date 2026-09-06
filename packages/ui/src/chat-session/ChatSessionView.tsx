import { useEffect, useRef } from 'react'

import './chat-session.scss'

import { ChatComposer } from './ChatComposer.js'
import { ChatMessageList } from './ChatMessageList.js'
import { ChatPlanCard } from './ChatPlanCard.js'
import type { ChatSessionViewProps } from './types.js'

/**
 * 中间栏聊天会话视图：加载态、消息列表、计划卡与底部输入框。
 *
 * 对话面消费 AG-UI `liveEvents` / `message.aguiEvents`；输入与计划编辑仍由宿主受控传入。
 *
 * composer 高度通过 ResizeObserver 动态写入 CSS 变量 --aw-composer-outer-height，
 * 让 padding-bottom 补偿精确匹配实际高度（多行输入/工具栏展开时自动调整）。
 *
 * @param props - 会话展示数据与回调
 */
export function ChatSessionView({
  isLoading,
  isEmpty,
  messages,
  liveEvents,
  isRun,
  runStats,
  sessionKey,
  onStopRun,
  onEditResend,
  onOpenExternal,
  emptyToolbar,
  plan,
  composer,
  className
}: ChatSessionViewProps) {
  const resolvedSessionKey = sessionKey ?? messages[0]?.id ?? null
  const composerStackRef = useRef<HTMLDivElement | null>(null)
  const innerRef = useRef<HTMLDivElement | null>(null)

  /** 动态测量 composer 外框高度，写入 CSS 变量供 padding-bottom 补偿 */
  useEffect(() => {
    const composerEl = composerStackRef.current
    const innerEl = innerRef.current
    if (!composerEl || !innerEl) return
    if (typeof ResizeObserver === 'undefined') return

    const applyHeight = () => {
      const h = composerEl.getBoundingClientRect().height
      if (h > 0) innerEl.style.setProperty('--aw-composer-outer-height', `${h}px`)
    }

    applyHeight()
    const ro = new ResizeObserver(applyHeight)
    ro.observe(composerEl)
    return () => ro.disconnect()
  }, [sessionKey, isLoading, isEmpty])

  return (
    <div
      className={`app-content${isEmpty ? ' is-empty-conversation' : ''}${isLoading ? ' is-session-loading' : ''}${className ? ` ${className}` : ''}`}
    >
      {isLoading ? (
        <div
          className="app-session-messages-loading"
          role="status"
          aria-live="polite"
          aria-label="加载会话中"
        >
          <span className="app-session-messages-loading-circle" aria-hidden />
        </div>
      ) : (
        <div className="app-content-inner" ref={innerRef}>
          <ChatMessageList
            sessionKey={resolvedSessionKey}
            messages={messages}
            liveEvents={liveEvents}
            isRun={isRun}
            runStats={runStats}
            onStopRun={onStopRun}
            onEditResend={onEditResend}
            onOpenExternal={onOpenExternal}
          />
          {plan ? (
            <div className="app-plan-card-stack">
              <ChatPlanCard {...plan} />
            </div>
          ) : null}
          <div className="app-composer-stack" ref={composerStackRef}>
            {isEmpty ? emptyToolbar : null}
            <ChatComposer {...composer} isRun={isRun} onStop={onStopRun} />
          </div>
        </div>
      )}
    </div>
  )
}
