import './chat-session.scss'

import { ChatComposer } from './ChatComposer.js'
import { ChatMessageList } from './ChatMessageList.js'
import { ChatPlanCard } from './ChatPlanCard.js'
import type { ChatSessionViewProps } from './types.js'

/**
 * 中间栏聊天会话视图：加载态、空会话 hero、消息列表、计划卡与输入框。
 *
 * 对话面消费 AG-UI `liveEvents` / `message.aguiEvents`；输入与计划编辑仍由宿主受控传入。
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
  const composerNode = (
    <ChatComposer {...composer} isEmptyConversation={isEmpty} isRun={isRun} onStop={onStopRun} />
  )

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
      ) : isEmpty ? (
        <div className="app-composer-hero">
          <div className="app-composer-hero-inner">
            {emptyToolbar}
            {composerNode}
          </div>
        </div>
      ) : (
        <>
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
          <div className="app-composer-stack">{composerNode}</div>
        </>
      )}
    </div>
  )
}
