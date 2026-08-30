import { EventType, type BaseEvent, type CustomEvent } from '@ag-ui/client'
import {
  ChatSessionWithHttp,
  OPENWORKER_PLAN_CUSTOM_NAME,
  type ChatSessionMessage,
  type ChatSessionRunRequest
} from '@openworker/ui'
import { App as AntdApp } from 'antd'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import {
  apiCancelAgent,
  apiCreateSession,
  apiGetSessionChatMessages,
  apiListSkills,
  apiSendAgentMessage,
  apiWriteWorkspaceFile
} from '@/renderer/src/api/native-api'
import { useUiStore } from '@/renderer/src/store/ui-store'
import type { AgentComposerMode, AgentStreamPayload } from '@/shared/ipc'

export type DesktopChatSessionProps = {
  /** 稳定挂载键；草稿转正时保持不变，避免 SSE 中断 */
  instanceKey: string
  sessionId: string | null
  workspaceId: string
  workspacePath: string | null
  visible: boolean
  emptyToolbar?: ReactNode
  onSessionCreated: (sessionId: string) => void
  refreshSessionsForWorkspace: (workspaceId: string) => Promise<void>
}

function toChatSessionMessages(
  messages: Array<{ id: string; role: string; content: string; aguiEvents?: BaseEvent[] }>
): ChatSessionMessage[] {
  return messages
    .filter((item) => item.role === 'user' || item.role === 'assistant' || item.role === 'system')
    .map((item) => ({
      id: item.id,
      role: item.role as ChatSessionMessage['role'],
      content: item.content,
      ...(item.aguiEvents ? { aguiEvents: item.aguiEvents } : {})
    }))
}

function userOrdinalAt(messages: ChatSessionRunRequest['messages'], messageId: string): number {
  const idx = messages.findIndex((item) => item.id === messageId)
  if (idx < 0) return -1
  let ordinal = -1
  for (let i = 0; i <= idx; i += 1) {
    if (messages[i]?.role === 'user') ordinal += 1
  }
  return ordinal
}

/**
 * Desktop 中栏聊天会话：桥接 Native API 与 `ChatSessionWithHttp`。
 */
export function DesktopChatSession({
  instanceKey,
  sessionId,
  workspaceId,
  workspacePath,
  visible,
  emptyToolbar,
  onSessionCreated,
  refreshSessionsForWorkspace
}: DesktopChatSessionProps) {
  const { message: msgApi, modal: modalApi } = AntdApp.useApp()
  const bridge = window.bridge

  const setSessionRunning = useUiStore((s) => s.setSessionRunning)
  const setSessionUnread = useUiStore((s) => s.setSessionUnread)
  const setInputDraft = useUiStore((s) => s.setInputDraft)

  const resolvedSessionIdRef = useRef<string | null>(sessionId)
  if (sessionId) resolvedSessionIdRef.current = sessionId

  const pendingModeRef = useRef<{ mode: AgentComposerMode; workspaceId: string } | null>(null)
  const sendTextRef = useRef<
    ((text: string, opts?: { mode?: AgentComposerMode; planMarkdown?: string }) => void) | null
  >(null)
  const blankCreateInFlightRef = useRef(false)
  const hydratedForRef = useRef<string | null>(null)

  const [hydrated, setHydrated] = useState(sessionId == null)
  const [hydrating, setHydrating] = useState(sessionId != null)
  const [initialMessages, setInitialMessages] = useState<ChatSessionMessage[]>([])
  const [planDraft, setPlanDraft] = useState<{ markdown: string; title?: string } | null>(null)
  const [planBuilding, setPlanBuilding] = useState(false)
  const [planSaving, setPlanSaving] = useState(false)
  const [isRunLocal, setIsRunLocal] = useState(false)

  const isDraftInstance = instanceKey.startsWith('draft-')

  useEffect(() => {
    if (!sessionId) {
      setHydrated(true)
      setHydrating(false)
      if (!resolvedSessionIdRef.current) setInitialMessages([])
      return
    }
    if (isDraftInstance || hydratedForRef.current === sessionId) {
      setHydrated(true)
      setHydrating(false)
      return
    }
    let cancelled = false
    setHydrating(true)
    void apiGetSessionChatMessages(sessionId)
      .then((list) => {
        if (cancelled) return
        setInitialMessages(toChatSessionMessages(list))
        hydratedForRef.current = sessionId
        setHydrated(true)
      })
      .catch(() => {
        if (!cancelled) {
          setInitialMessages([])
          hydratedForRef.current = sessionId
          setHydrated(true)
        }
      })
      .finally(() => {
        if (!cancelled) setHydrating(false)
      })
    return () => {
      cancelled = true
    }
  }, [isDraftInstance, sessionId])

  const ensureSessionId = useCallback(
    async (text: string): Promise<string | null> => {
      if (resolvedSessionIdRef.current) return resolvedSessionIdRef.current
      if (blankCreateInFlightRef.current) return null
      blankCreateInFlightRef.current = true
      try {
        const provisional = text.replace(/\s+/g, ' ').trim().slice(0, 50) || '新会话'
        const created = await apiCreateSession(workspaceId, provisional)
        resolvedSessionIdRef.current = created.id
        hydratedForRef.current = created.id
        onSessionCreated(created.id)
        await refreshSessionsForWorkspace(workspaceId)
        return created.id
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        msgApi.error(`创建会话失败：${msg}`)
        return null
      } finally {
        blankCreateInFlightRef.current = false
      }
    },
    [msgApi, onSessionCreated, refreshSessionsForWorkspace, workspaceId]
  )

  const onRunRequest = useCallback(
    async ({
      text,
      editMessageId,
      messages,
      mode = 'build',
      planMarkdown,
      signal,
      onEvent,
      reconnect
    }: ChatSessionRunRequest) => {
      if (!workspacePath) {
        throw new Error('请先为当前工作区绑定路径')
      }

      let sid = resolvedSessionIdRef.current
      if (!reconnect) {
        const payloadText = text.trim()
        if (!payloadText) throw new Error('缺少 text')
        if (!sid) {
          sid = await ensureSessionId(payloadText)
          if (!sid) throw new Error('创建会话失败')
        }
        pendingModeRef.current = { mode: mode ?? 'build', workspaceId }
      } else if (!sid) {
        return
      }

      const editUserOrdinal =
        editMessageId != null ? userOrdinalAt(messages, editMessageId) : undefined

      const handleStream = (payload: AgentStreamPayload) => {
        if (payload.sessionId !== sid) return
        const event = payload.event

        if (event.type === EventType.CUSTOM) {
          const custom = event as CustomEvent
          if (custom.name === OPENWORKER_PLAN_CUSTOM_NAME) {
            const value =
              custom.value && typeof custom.value === 'object'
                ? (custom.value as { markdown?: unknown; title?: unknown })
                : null
            const markdown = typeof value?.markdown === 'string' ? value.markdown.trim() : ''
            if (markdown) {
              const title = typeof value?.title === 'string' ? value.title.trim() : undefined
              setPlanDraft({ markdown, ...(title ? { title } : {}) })
            }
            return
          }
        }

        if (event.type === EventType.RUN_FINISHED) {
          const pending = pendingModeRef.current
          pendingModeRef.current = null
          const { activeSessionId: viewingId } = useUiStore.getState()
          if (pending && sid && sid !== viewingId) {
            setSessionUnread(pending.workspaceId, sid, pending.mode === 'plan' ? 'plan' : 'other')
          }
        }

        onEvent(event as BaseEvent)
      }

      if (!reconnect) {
        const r = await apiSendAgentMessage(
          sid!,
          text.trim(),
          {
            mode: mode ?? 'build',
            workspacePath,
            ...(editUserOrdinal != null && editUserOrdinal >= 0 ? { editUserOrdinal } : {}),
            ...(mode === 'build' && planMarkdown?.trim()
              ? { planMarkdown: planMarkdown.trim() }
              : {})
          },
          handleStream,
          signal
        )
        if (!r.ok) {
          pendingModeRef.current = null
          throw new Error(r.error)
        }
        await refreshSessionsForWorkspace(workspaceId)
      }
    },
    [ensureSessionId, refreshSessionsForWorkspace, setSessionUnread, workspaceId, workspacePath]
  )

  const onStopRequest = useCallback(async () => {
    const sid = resolvedSessionIdRef.current
    if (!sid) return
    await apiCancelAgent(sid)
  }, [])

  const loadSkills = useCallback(async () => {
    const list = await apiListSkills(workspaceId)
    return (list ?? []).map((skill) => ({
      name: skill.name,
      description: skill.description,
      source: skill.source
    }))
  }, [workspaceId])

  const onOpenExternal = useCallback(
    async (href: string) => {
      const target = (() => {
        try {
          const parsed = new URL(href)
          return parsed.host || href
        } catch {
          return href
        }
      })()
      return new Promise<{ ok: boolean }>((resolve) => {
        modalApi.confirm({
          title: '即将打开外部链接',
          content: `目标地址：${target}`,
          centered: true,
          okText: '继续打开',
          cancelText: '取消',
          onOk: async () => {
            const r = await bridge.openExternal(href)
            if (!r.ok) msgApi.warning('打开链接失败')
            resolve({ ok: r.ok })
          },
          onCancel: () => resolve({ ok: false })
        })
      })
    },
    [bridge, modalApi, msgApi]
  )

  const savePlanToWorkspace = useCallback(async () => {
    if (!planDraft?.markdown.trim()) {
      msgApi.warning('暂无计划可保存')
      return
    }
    if (planSaving) return
    setPlanSaving(true)
    try {
      const slugBase =
        (planDraft.title || 'plan')
          .toLowerCase()
          .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 48) || 'plan'
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      const relativePath = `.openworker/plans/${slugBase}-${stamp}.md`
      const result = await apiWriteWorkspaceFile(
        workspaceId,
        relativePath,
        planDraft.markdown.trim() + '\n'
      )
      msgApi.success(`已保存到 ${result.path}`)
    } catch (error) {
      msgApi.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPlanSaving(false)
    }
  }, [msgApi, planDraft, planSaving, workspaceId])

  const buildApprovedPlan = useCallback(async () => {
    if (!planDraft?.markdown.trim()) {
      msgApi.warning('暂无计划可构建')
      return
    }
    if (planBuilding || isRunLocal) return
    setPlanBuilding(true)
    try {
      sendTextRef.current?.('请按已批准的实施计划执行。', {
        mode: 'build',
        planMarkdown: planDraft.markdown
      })
    } finally {
      setPlanBuilding(false)
    }
  }, [isRunLocal, msgApi, planBuilding, planDraft])

  const onRunStateChange = useCallback(
    (running: boolean) => {
      setIsRunLocal(running)
      const sid = resolvedSessionIdRef.current
      if (sid) setSessionRunning(sid, running)
    },
    [setSessionRunning]
  )

  const plan =
    planDraft != null
      ? {
          title: planDraft.title,
          markdown: planDraft.markdown,
          onMarkdownChange: (markdown: string) => {
            setPlanDraft((prev) => (prev ? { ...prev, markdown } : null))
          },
          onSave: () => void savePlanToWorkspace(),
          onBuild: () => void buildApprovedPlan(),
          saving: planSaving,
          building: planBuilding,
          buildDisabled: isRunLocal
        }
      : null

  if (hydrating || !hydrated) {
    return (
      <div className="app-content is-session-loading" hidden={!visible}>
        <div
          className="app-session-messages-loading"
          role="status"
          aria-live="polite"
          aria-label="加载会话中"
        >
          <span className="app-session-messages-loading-circle" aria-hidden />
        </div>
      </div>
    )
  }

  return (
    <div className="app-chat-session-root" hidden={!visible}>
      <ChatSessionWithHttp
        key={instanceKey}
        sessionKey={instanceKey}
        initialMessages={initialMessages}
        emptyToolbar={emptyToolbar}
        sendDisabled={!workspacePath}
        onRunRequest={onRunRequest}
        onStopRequest={onStopRequest}
        loadSkills={loadSkills}
        onOpenExternal={onOpenExternal}
        onInputChange={resolvedSessionIdRef.current == null ? setInputDraft : undefined}
        onRunStateChange={onRunStateChange}
        plan={plan}
        sendTextRef={sendTextRef}
      />
    </div>
  )
}
