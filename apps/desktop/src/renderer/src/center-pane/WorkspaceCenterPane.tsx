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
  /** 草稿转正后会话是否曾进入 running；用于 run 结束后再释放 draft 实例 */
  const draftHadRunningRef = useRef(false)

  useEffect(() => {
    if (promotedDraftId && p.activeId !== promotedDraftId) {
      draftHadRunningRef.current = false
      setPromotedDraftId(null)
    }
  }, [p.activeId, promotedDraftId])

  useEffect(() => {
    if (!promotedDraftId) return
    if (runningBySessionId[promotedDraftId]) {
      draftHadRunningRef.current = true
      return
    }
    if (draftHadRunningRef.current) {
      draftHadRunningRef.current = false
      setPromotedDraftId(null)
    }
  }, [promotedDraftId, runningBySessionId])

  const sessionSlots = useMemo((): SessionSlot[] => {
    const draftKey = `draft-${p.composerSelectedWorkspaceId}`
    const draftOwnsActive = promotedDraftId != null && p.activeId === promotedDraftId
    const slots: SessionSlot[] = []

    if (p.activeId === null) {
      slots.push({ instanceKey: draftKey, sessionId: null, visible: true })
    } else if (draftOwnsActive) {
      slots.push({ instanceKey: draftKey, sessionId: promotedDraftId, visible: true })
    } else {
      slots.push({ instanceKey: p.activeId, sessionId: p.activeId, visible: true })
    }

    for (const [sessionId, running] of Object.entries(runningBySessionId)) {
      if (!running) continue
      if (sessionId === p.activeId) continue
      if (draftOwnsActive && sessionId === promotedDraftId) continue
      if (slots.some((slot) => slot.sessionId === sessionId)) continue
      slots.push({ instanceKey: sessionId, sessionId, visible: false })
    }

    return slots
  }, [p.activeId, p.composerSelectedWorkspaceId, promotedDraftId, runningBySessionId])

  const handleSessionCreated = (sessionId: string) => {
    setPromotedDraftId(sessionId)
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
