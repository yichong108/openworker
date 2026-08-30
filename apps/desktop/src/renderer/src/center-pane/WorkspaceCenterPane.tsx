import 'simplebar-react/dist/simplebar.min.css'
import '@openworker/ui/chat-session/chat-session.scss'
import '@/renderer/src/center-pane/WorkspaceCenterPane.scss'
import { DesktopChatSession } from './DesktopChatSession'
import {
  useWorkspaceCenterPane,
  type UseWorkspaceCenterPaneOptions
} from './useWorkspaceCenterPane'
import { MenuUnfoldOutlined } from '@ant-design/icons'
import { Alert, Button } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

import openworkerLogoUrl from '@/renderer/src/assets/openworker-logo.png'
import { useUiStore } from '@/renderer/src/store/ui-store'

export type WorkspaceCenterPaneProps = UseWorkspaceCenterPaneOptions

type SessionSlot = {
  instanceKey: string
  sessionId: string | null
  visible: boolean
}

export function WorkspaceCenterPane(props: WorkspaceCenterPaneProps) {
  const p = useWorkspaceCenterPane(props)
  const runningBySessionId = useUiStore((s) => s.runningBySessionId)
  const [promotedDraftId, setPromotedDraftId] = useState<string | null>(null)
  /** 同步可读：Zustand setActiveId 会立刻触发重渲染，早于 React setState */
  const promotedDraftIdRef = useRef<string | null>(null)

  useEffect(() => {
    // activeId 尚未跟上时（草稿转正瞬间）不要清 promotedDraftId
    if (promotedDraftId && p.activeId != null && p.activeId !== promotedDraftId) {
      promotedDraftIdRef.current = null
      setPromotedDraftId(null)
    }
  }, [p.activeId, promotedDraftId])

  const sessionSlots = useMemo((): SessionSlot[] => {
    const draftKey = `draft-${p.composerSelectedWorkspaceId}`
    const effectivePromoted = promotedDraftIdRef.current ?? promotedDraftId
    const draftOwnsActive = effectivePromoted != null && p.activeId === effectivePromoted
    const slots: SessionSlot[] = []

    if (p.activeId === null) {
      slots.push({ instanceKey: draftKey, sessionId: null, visible: true })
    } else if (draftOwnsActive) {
      slots.push({ instanceKey: draftKey, sessionId: effectivePromoted, visible: true })
    } else {
      slots.push({ instanceKey: p.activeId, sessionId: p.activeId, visible: true })
    }

    for (const [sessionId, running] of Object.entries(runningBySessionId)) {
      if (!running) continue
      if (sessionId === p.activeId) continue
      if (draftOwnsActive && sessionId === effectivePromoted) continue
      if (slots.some((slot) => slot.sessionId === sessionId)) continue
      slots.push({ instanceKey: sessionId, sessionId, visible: false })
    }

    return slots
  }, [p.activeId, p.composerSelectedWorkspaceId, promotedDraftId, runningBySessionId])

  const handleSessionCreated = (sessionId: string) => {
    promotedDraftIdRef.current = sessionId
    flushSync(() => setPromotedDraftId(sessionId))
    p.handleSessionCreated(sessionId)
  }

  return (
    <div className="app-main-pane">
      <div className="app-topbar">
        {p.isWinCustomChrome ? (
          <div
            className="app-topbar-leading"
            ref={(el) => {
              p.onLeftTogglePortalHostChange(el)
            }}
          />
        ) : (
          <div className="app-topbar-leading-cluster">
            <span className="app-brand-logo-visual app-brand-logo-visual--topbar">
              <img
                src={openworkerLogoUrl}
                alt=""
                width={19}
                height={19}
                className="app-topbar-brand-logo"
                draggable={false}
              />
            </span>
            <div
              className="app-topbar-leading"
              ref={(el) => {
                p.onLeftTogglePortalHostChange(el)
              }}
            />
          </div>
        )}
        <div className="app-topbar-body" />
        {p.isRightPaneCollapsed ? (
          <div className="app-topbar-trailing">
            <Button
              type="text"
              icon={<MenuUnfoldOutlined />}
              onClick={p.onRightPaneExpand}
              className="app-settings-btn app-topbar-pane-toggle"
              title="展开右边栏"
              aria-label="展开右边栏"
            />
          </div>
        ) : null}
      </div>

      <div className="app-content">
        {!p.preloadOk && (
          <div className="app-preload-alert-wrap">
            <Alert
              type="error"
              showIcon
              message="preload 注入失败"
              description="当前窗口未接收到主进程暴露的 API（window.bridge）。请重启 dev 进程后重试。"
            />
          </div>
        )}

        {sessionSlots.map((slot) => (
          <DesktopChatSession
            key={slot.instanceKey}
            instanceKey={slot.instanceKey}
            sessionId={slot.sessionId}
            workspaceId={p.composerSelectedWorkspaceId}
            workspacePath={p.activeWorkspace?.path ?? null}
            visible={slot.visible}
            emptyToolbar={p.composerWorkspaceToolbar}
            onSessionCreated={handleSessionCreated}
            refreshSessionsForWorkspace={p.refreshSessionsForWorkspace}
          />
        ))}
      </div>
    </div>
  )
}
