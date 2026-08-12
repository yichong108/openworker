import {
  appendAssistantText,
  filterSessionsForSidebar,
  PRELOAD_MISSING_ERROR,
  randomId,
  type RunStats
} from './center-pane-utils'
import {
  aguiEventsToToolTimeline,
  isAguiTimelineSourceEvent,
  OPENWORKER_PLAN_CUSTOM_NAME,
  TEXT_DELTA_CUSTOM_NAME,
  TEXT_REVOKE_CUSTOM_NAME
} from './agui-timeline'
import {
  EventType,
  type BaseEvent,
  type CustomEvent,
  type RunErrorEvent,
  type RunFinishedEvent,
  type RunStartedEvent,
  type TextMessageContentEvent
} from '@ag-ui/client'
import {
  CheckOutlined,
  DownOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  SendOutlined,
  StopOutlined
} from '@ant-design/icons'
import { App as AntdApp, Button, Dropdown, Input, MenuProps } from 'antd'
import type { InputRef } from 'antd/es/input'
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

import {
  apiCancelAgent,
  apiCreateSession,
  apiGetSessionChatMessages,
  apiListSessions,
  apiListSkills,
  apiListWorkspaces,
  apiSendAgentMessage,
  apiUpsertWorkspaceByPath,
  apiWriteWorkspaceFile
} from '@/renderer/src/api/native-api'
import { ComposerSkillMenu } from '@/renderer/src/center-pane/ComposerSkillMenu'
import {
  applySkillSlashSelection,
  filterSkillsByQuery,
  findActiveSlashSkillToken,
  getComposerTextarea,
  type SlashSkillToken
} from '@/renderer/src/center-pane/composer-slash-skills'
import { useUiStore } from '@/renderer/src/store/ui-store'
import { useWorkspaceStore } from '@/renderer/src/store/workspace-store'
import {
  type AgentComposerMode,
  type AgentStreamPayload,
  type ChatMessage,
  HOME_WORKSPACE_ID,
  type SessionInfo,
  type SkillListItem,
  type ToolTimelineEvent,
  type WorkspaceInfo
} from '@/shared/ipc'

const { TextArea } = Input

export type UseWorkspaceCenterPaneOptions = {
  isWinCustomChrome: boolean
  isRightPaneCollapsed: boolean
  onRightPaneExpand: () => void
  onLeftTogglePortalHostChange: (el: HTMLDivElement | null) => void
}

export function useWorkspaceCenterPane({
  isWinCustomChrome,
  isRightPaneCollapsed,
  onRightPaneExpand,
  onLeftTogglePortalHostChange
}: UseWorkspaceCenterPaneOptions) {
  const { message: msgApi } = AntdApp.useApp()
  const preloadOk = typeof window !== 'undefined' && typeof window.bridge !== 'undefined'
  const bridge = window.bridge

  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const setWorkspaces = useWorkspaceStore((s) => s.setWorkspaces)
  const sessionsByWorkspace = useWorkspaceStore((s) => s.sessionsByWorkspace)
  const setSessionsByWorkspace = useWorkspaceStore((s) => s.setSessionsByWorkspace)
  const updateSessionsForWorkspace = useWorkspaceStore((s) => s.updateSessionsForWorkspace)
  const setExpandedWorkspaceIds = useWorkspaceStore((s) => s.setExpandedWorkspaceIds)
  const activeWorkspaceId = useUiStore((s) => s.activeWorkspaceId)
  const setActiveWorkspaceId = useUiStore((s) => s.setActiveWorkspaceId)
  /** 当前会话 ID */
  const activeId = useUiStore((s) => s.activeSessionId)
  /** 设置当前会话 ID */
  const setActiveId = useUiStore((s) => s.setActiveSessionId)
  /** 输入框内容 */
  const input = useUiStore((s) => s.inputDraft)
  /** 设置输入框内容 */
  const setInput = useUiStore((s) => s.setInputDraft)
  /** 输入框焦点 nonce */
  const composerFocusNonce = useUiStore((s) => s.composerFocusNonce)
  /** 从主进程恢复 UI 状态 */
  const hydrateUiStore = useUiStore((s) => s.hydrateFromMain)

  const composerInputRef = useRef<InputRef>(null)

  useLayoutEffect(() => {
    if (!composerFocusNonce) return
    composerInputRef.current?.focus({ preventScroll: true })
  }, [composerFocusNonce])

  /** Composer 模式：Build / Ask / Plan */
  const [composerMode, setComposerMode] = useState<AgentComposerMode>('build')

  /** 会话级可编辑计划草稿（来自 CUSTOM(openworker.plan)） */
  const [planDrafts, setPlanDrafts] = useState<
    Record<string, { markdown: string; title?: string }>
  >({})
  const [planBuilding, setPlanBuilding] = useState(false)
  const [planSaving, setPlanSaving] = useState(false)

  /** 用户 skills 目录扫描结果（`/` 菜单数据源） */
  const [skills, setSkills] = useState<SkillListItem[]>([])
  const [skillsLoading, setSkillsLoading] = useState(false)
  /** 当前活跃的 `/` token；null 表示菜单关闭 */
  const [slashToken, setSlashToken] = useState<SlashSkillToken | null>(null)
  const [skillMenuActiveIndex, setSkillMenuActiveIndex] = useState(0)
  const skillsLoadedRef = useRef(false)

  /**
   * 拉取可用技能列表（惰性：首次打开 `/` 菜单时加载，之后复用缓存）。
   */
  const ensureSkillsLoaded = useCallback(async () => {
    if (skillsLoadedRef.current) return
    skillsLoadedRef.current = true
    setSkillsLoading(true)
    try {
      const list = await apiListSkills()
      setSkills(Array.isArray(list) ? list : [])
    } catch {
      skillsLoadedRef.current = false
      setSkills([])
    } finally {
      setSkillsLoading(false)
    }
  }, [])

  const filteredSkills = useMemo(
    () => (slashToken ? filterSkillsByQuery(skills, slashToken.query) : []),
    [skills, slashToken]
  )

  useEffect(() => {
    if (!slashToken) return
    setSkillMenuActiveIndex(0)
  }, [slashToken?.query, slashToken])

  useEffect(() => {
    if (skillMenuActiveIndex < filteredSkills.length) return
    setSkillMenuActiveIndex(filteredSkills.length > 0 ? filteredSkills.length - 1 : 0)
  }, [filteredSkills.length, skillMenuActiveIndex])

  /**
   * 根据 textarea 光标位置同步斜杠技能菜单开关状态。
   *
   * @param text - 当前输入全文
   * @param cursor - 光标位置；省略时从 DOM 读取
   */
  const syncSlashSkillMenu = useCallback(
    (text: string, cursor?: number) => {
      const textarea = getComposerTextarea(composerInputRef.current)
      const pos = cursor ?? textarea?.selectionStart ?? text.length
      const token = findActiveSlashSkillToken(text, pos)
      setSlashToken(token)
      if (token) void ensureSkillsLoaded()
    },
    [ensureSkillsLoaded]
  )

  /**
   * 将选中技能写入输入框，替换当前 `/query` 为 `/skillName `。
   *
   * @param skill - 选中的技能
   */
  const selectSkillFromMenu = useCallback(
    (skill: SkillListItem) => {
      if (!slashToken) return
      const { nextText, nextCursor } = applySkillSlashSelection(input, slashToken, skill.name)
      setInput(nextText)
      setSlashToken(null)
      requestAnimationFrame(() => {
        const textarea = getComposerTextarea(composerInputRef.current)
        if (!textarea) return
        textarea.focus()
        textarea.setSelectionRange(nextCursor, nextCursor)
      })
    },
    [input, setInput, slashToken]
  )

  /** 顶栏工作区下拉始终含 Home；侧栏移除 Home 后主进程同步列表可能不含该项 */
  const workspacesWithComposerHomeStub = useMemo(() => {
    if (workspaces.some((w) => w.id === HOME_WORKSPACE_ID)) return workspaces
    const stub: WorkspaceInfo = {
      id: HOME_WORKSPACE_ID,
      name: '主目录',
      path: null,
      createdAt: 0,
      updatedAt: 0
    }
    return [stub, ...workspaces]
  }, [workspaces])

  /** 顶栏当前工作区：与主进程一致；仅 null 时视为 Home（避免列表尚未合并时误当作无效选中） */
  const composerSelectedWorkspaceId = useMemo(
    () => activeWorkspaceId ?? HOME_WORKSPACE_ID,
    [activeWorkspaceId]
  )

  /** 避免首屏 load 完成前把「无选中」误判为需要强制回到 Home */
  const didInitialWorkspaceLoadRef = useRef(false)
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({})
  /** 本轮直播 AG-UI 工具相关事件（渲染层再派生 ToolTimelineEvent） */
  const [liveAguiEvents, setLiveAguiEvents] = useState<Record<string, BaseEvent[]>>({})
  const [running, setRunning] = useState<Record<string, boolean>>({})
  const [runStats, setRunStats] = useState<Record<string, RunStats | undefined>>({})
  const streamBuf = useRef<Record<string, string>>({})
  const assistantMsgId = useRef<Record<string, string | null>>({})
  const hydratedMessageSessions = useRef<Set<string>>(new Set())
  /** 同会话发送 IPC 进行中，防止连点重复发送（不等同于 agent 已 RUN_STARTED） */
  const sendInFlightRef = useRef(new Set<string>())
  /** 空白对话首发创建会话中的互斥锁，防止连点创建多个会话 */
  const blankCreateInFlightRef = useRef(false)
  /** 整次 send() 防重入（含 Enter / 按钮连点） */
  const sendClickLockRef = useRef(false)

  const timeline = useMemo(() => {
    const next: Record<string, ToolTimelineEvent[]> = {}
    for (const [sessionId, events] of Object.entries(liveAguiEvents)) {
      const stats = runStats[sessionId]
      next[sessionId] = aguiEventsToToolTimeline(events, {
        runId: stats?.runId,
        traceId: stats?.traceId
      })
    }
    return next
  }, [liveAguiEvents, runStats])

  /**
   * 从 Native 拉取会话消息并写入本地 state。
   *
   * 非 force 时若本地消息更长（如首发乐观追加），则不覆盖，避免空列表冲掉回显。
   *
   * @param sessionId - 会话 id
   * @param force - 为 true 时强制以服务端列表覆盖本地
   */
  const ensureSessionMessages = useCallback(async (sessionId: string, force = false) => {
    if (!sessionId) return
    if (!force && hydratedMessageSessions.current.has(sessionId)) return
    const list = await apiGetSessionChatMessages(sessionId)
    setMessages((m) => {
      const local = m[sessionId] ?? []
      if (!force && local.length > list.length) {
        return m
      }
      return { ...m, [sessionId]: list }
    })
    hydratedMessageSessions.current.add(sessionId)
  }, [])

  /**
   * 刷新指定工作区的会话列表（创建 / 重命名 / 自动命名后调用）。
   *
   * @param workspaceId - 工作区 id
   */
  const refreshSessionsForWorkspace = useCallback(
    async (workspaceId: string) => {
      if (!workspaceId) return
      const list = await apiListSessions(workspaceId)
      updateSessionsForWorkspace(workspaceId, list)
      const validIds = new Set(list.map((x) => x.id))
      for (const id of hydratedMessageSessions.current) {
        if (!validIds.has(id)) hydratedMessageSessions.current.delete(id)
      }
    },
    [updateSessionsForWorkspace]
  )

  /**
   * 本地激活工作区：更新 UI 状态，并可选通知主进程文件树根路径。
   *
   * @param workspaceId - 工作区 id
   * @returns 激活后的工作区，找不到时返回 null
   */
  const activateWorkspaceLocal = useCallback(
    (workspaceId: string): WorkspaceInfo | null => {
      const fromStore = useWorkspaceStore.getState().workspaces.find((w) => w.id === workspaceId)
      const workspace =
        fromStore ??
        (workspaceId === HOME_WORKSPACE_ID
          ? {
              id: HOME_WORKSPACE_ID,
              name: '主目录',
              path: null as string | null,
              createdAt: 0,
              updatedAt: 0
            }
          : null)
      if (!workspace) return null
      setActiveWorkspaceId(workspace.id)
      if (workspace.path) {
        void bridge.setWorkspaceFsRoot?.(workspace.path)
      }
      return workspace
    },
    [bridge, setActiveWorkspaceId]
  )

  const load = useCallback(async () => {
    const workspaceList = await apiListWorkspaces()
    flushSync(() => {
      setWorkspaces(workspaceList)
      setExpandedWorkspaceIds(new Set(workspaceList.map((workspace) => workspace.id)))
    })

    const persistedActiveId = useUiStore.getState().activeWorkspaceId
    const validIds = new Set(workspaceList.map((w) => w.id))
    let activeWsId = persistedActiveId
    if (activeWsId && !validIds.has(activeWsId) && activeWsId !== HOME_WORKSPACE_ID) {
      activeWsId = workspaceList[0]?.id ?? HOME_WORKSPACE_ID
      setActiveWorkspaceId(activeWsId)
    } else if (activeWsId && validIds.has(activeWsId)) {
      const ws = workspaceList.find((w) => w.id === activeWsId)
      if (ws?.path) void bridge.setWorkspaceFsRoot?.(ws.path)
    }

    const sessionsMap: Record<string, SessionInfo[]> = {}
    const entries = await Promise.all(
      workspaceList.map(async (workspace) => {
        const list = await apiListSessions(workspace.id)
        return [workspace.id, list] as const
      })
    )
    for (const [workspaceId, list] of entries) {
      sessionsMap[workspaceId] = list
    }
    setSessionsByWorkspace(sessionsMap)

    const resolvedWsId = activeWsId ?? ''
    const hidden = useUiStore.getState().byWorkspace[resolvedWsId]?.sidebarHiddenSessionIds ?? []
    const activeListRaw = sessionsMap[resolvedWsId] ?? []
    const activeList = filterSessionsForSidebar(activeListRaw, hidden)
    const currentActiveId = useUiStore.getState().activeSessionId
    const nextActiveId =
      currentActiveId && activeList.some((x) => x.id === currentActiveId)
        ? currentActiveId
        : (activeList[0]?.id ?? null)
    setActiveId(nextActiveId)
    if (nextActiveId) {
      await ensureSessionMessages(nextActiveId, true)
    }
    didInitialWorkspaceLoadRef.current = true
  }, [
    bridge,
    ensureSessionMessages,
    setActiveId,
    setActiveWorkspaceId,
    setExpandedWorkspaceIds,
    setSessionsByWorkspace,
    setWorkspaces
  ])

  const handleStream = useCallback(
    (payload: AgentStreamPayload) => {
      const { sessionId, event } = payload

      if (event.type === EventType.RUN_STARTED) {
        const e = event as RunStartedEvent
        const startedAt = e.timestamp ?? Date.now()
        setRunning((r) => ({ ...r, [sessionId]: true }))
        setRunStats((s) => ({
          ...s,
          [sessionId]: {
            runId: e.runId,
            traceId: `${sessionId}:${e.runId}`,
            startedAt,
            durationMs: 0
          }
        }))
        streamBuf.current[sessionId] = ''
        setLiveAguiEvents((t) => ({ ...t, [sessionId]: [] }))
        const aid = randomId()
        assistantMsgId.current[sessionId] = aid
        setMessages((m) => {
          const cur = m[sessionId] ?? []
          return {
            ...m,
            [sessionId]: [...cur, { id: aid, role: 'assistant' as const, content: '' }]
          }
        })
        return
      }

      // 运行中打字机预览（CUSTOM）；确认后的 TEXT_MESSAGE_CONTENT 再对齐一次终稿
      if (event.type === EventType.CUSTOM) {
        const custom = event as CustomEvent
        if (custom.name === TEXT_DELTA_CUSTOM_NAME) {
          const delta =
            custom.value &&
            typeof custom.value === 'object' &&
            typeof (custom.value as { delta?: unknown }).delta === 'string'
              ? (custom.value as { delta: string }).delta
              : ''
          if (!delta) return
          streamBuf.current[sessionId] = (streamBuf.current[sessionId] ?? '') + delta
          const buf = streamBuf.current[sessionId]!
          const amId = assistantMsgId.current[sessionId]
          if (!amId) return
          setMessages((m) => {
            const cur = [...(m[sessionId] ?? [])]
            const idx = cur.findIndex((c) => c.id === amId)
            if (idx < 0) return m
            cur[idx] = { ...cur[idx]!, content: buf }
            return { ...m, [sessionId]: cur }
          })
          return
        }
        if (custom.name === TEXT_REVOKE_CUSTOM_NAME) {
          streamBuf.current[sessionId] = ''
          const amId = assistantMsgId.current[sessionId]
          if (!amId) return
          setMessages((m) => {
            const cur = [...(m[sessionId] ?? [])]
            const idx = cur.findIndex((c) => c.id === amId)
            if (idx < 0) return m
            cur[idx] = { ...cur[idx]!, content: '' }
            return { ...m, [sessionId]: cur }
          })
          return
        }
        if (custom.name === OPENWORKER_PLAN_CUSTOM_NAME) {
          const value =
            custom.value && typeof custom.value === 'object'
              ? (custom.value as { markdown?: unknown; title?: unknown })
              : null
          const markdown = typeof value?.markdown === 'string' ? value.markdown.trim() : ''
          if (!markdown) return
          const title = typeof value?.title === 'string' ? value.title.trim() : undefined
          setPlanDrafts((d) => ({
            ...d,
            [sessionId]: { markdown, ...(title ? { title } : {}) }
          }))
          return
        }
      }

      if (event.type === EventType.TEXT_MESSAGE_CONTENT) {
        const e = event as TextMessageContentEvent
        const prev = streamBuf.current[sessionId] ?? ''
        // OpenWorker：CUSTOM 预览后常跟整段终稿；相同时跳过，终稿覆盖预览前缀。
        // Cursor 等经典路径：仍按小 delta 追加。
        if (prev === e.delta) return
        streamBuf.current[sessionId] =
          prev.length > 0 && e.delta.startsWith(prev) ? e.delta : prev + e.delta
        const buf = streamBuf.current[sessionId]!
        const amId = assistantMsgId.current[sessionId]
        if (!amId) return
        setMessages((m) => {
          const cur = [...(m[sessionId] ?? [])]
          const idx = cur.findIndex((c) => c.id === amId)
          if (idx < 0) return m
          const next = { ...cur[idx]!, content: buf }
          cur[idx] = next
          return { ...m, [sessionId]: cur }
        })
        return
      }

      if (isAguiTimelineSourceEvent(event)) {
        if (event.type === EventType.RUN_ERROR) {
          const e = event as RunErrorEvent
          const cancelled = e.code === 'CANCELLED'
          if (!cancelled) {
            msgApi.error(e.message)
            setMessages((m) => {
              const cur = m[sessionId] ?? []
              return {
                ...m,
                [sessionId]: appendAssistantText(cur, `执行失败：${e.message}`)
              }
            })
          }
          setRunning((r) => ({ ...r, [sessionId]: false }))
          setRunStats((s) => {
            const cur = s[sessionId]
            if (!cur) return s
            const durationMs = cur.startedAt ? Math.max(0, Date.now() - cur.startedAt) : undefined
            return {
              ...s,
              [sessionId]: {
                ...cur,
                durationMs
              }
            }
          })
        }
        setLiveAguiEvents((t) => ({
          ...t,
          [sessionId]: [...(t[sessionId] ?? []), event]
        }))
        return
      }

      if (event.type === EventType.RUN_FINISHED) {
        const e = event as RunFinishedEvent
        setRunning((r) => ({ ...r, [sessionId]: false }))
        setRunStats((s) => {
          const cur = s[sessionId]
          if (!cur) return s
          const durationMs = cur.startedAt
            ? Math.max(0, (e.timestamp ?? Date.now()) - cur.startedAt)
            : undefined
          return {
            ...s,
            [sessionId]: { ...cur, durationMs }
          }
        })
        streamBuf.current[sessionId] = ''
        assistantMsgId.current[sessionId] = null
        // 不在此处 force 重载：RUN_FINISHED 早于 main 落盘，强制拉取会用旧列表冲掉流式正文
      }
    },
    [msgApi]
  )

  useEffect(() => {
    if (!preloadOk) {
      msgApi.error(PRELOAD_MISSING_ERROR)
      return
    }
    void (async () => {
      await hydrateUiStore()
      await load()
    })()
  }, [hydrateUiStore, load, msgApi, preloadOk])

  useEffect(() => {
    if (!activeId) return
    void ensureSessionMessages(activeId)
  }, [activeId, ensureSessionMessages])

  const pickWorkspace = useCallback(async () => {
    const result = await bridge.selectWorkspace()
    const path = typeof result?.path === 'string' ? result.path.trim() : ''
    if (!path) return
    try {
      const ws = await apiUpsertWorkspaceByPath(path)
      const list = await apiListWorkspaces()
      flushSync(() => {
        setWorkspaces(list)
        setExpandedWorkspaceIds(new Set(list.map((w) => w.id)))
      })
      setActiveWorkspaceId(ws.id)
      void bridge.setWorkspaceFsRoot?.(path)
      const sessions = await apiListSessions(ws.id)
      updateSessionsForWorkspace(ws.id, sessions)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      msgApi.error(`添加工作区失败：${msg}`)
    }
  }, [
    bridge,
    msgApi,
    setActiveWorkspaceId,
    setExpandedWorkspaceIds,
    setWorkspaces,
    updateSessionsForWorkspace
  ])

  const switchComposerWorkspace = useCallback(
    async (workspaceId: string) => {
      if (!workspaceId || workspaceId === composerSelectedWorkspaceId) return
      const workspace = activateWorkspaceLocal(workspaceId)
      if (!workspace) {
        msgApi.error('切换工作区失败')
      }
    },
    [activateWorkspaceLocal, composerSelectedWorkspaceId, msgApi]
  )

  const handleComposerWorkspaceMenuClick = useCallback<NonNullable<MenuProps['onClick']>>(
    ({ key }) => {
      if (key === '__pick__') {
        void pickWorkspace()
        return
      }
      void switchComposerWorkspace(String(key))
    },
    [pickWorkspace, switchComposerWorkspace]
  )

  const handleComposerPlusMenuClick = useCallback<NonNullable<MenuProps['onClick']>>(({ key }) => {
    if (key === 'build' || key === 'ask' || key === 'plan') {
      setComposerMode(key)
    }
  }, [])

  const composerModeLabel = (mode: AgentComposerMode): string => {
    if (mode === 'ask') return '问答'
    if (mode === 'plan') return '计划'
    return '构建'
  }

  const composerPlusMenuItems = useMemo<MenuProps['items']>(
    () =>
      (['build', 'ask', 'plan'] as const).map((mode) => ({
        key: mode,
        label: (
          <span className="app-composer-plus-menu-title">
            <span>{composerModeLabel(mode)}</span>
            {composerMode === mode ? (
              <CheckOutlined className="app-composer-plus-menu-check" aria-hidden />
            ) : null}
          </span>
        )
      })),
    [composerMode]
  )

  const composerWorkspaceMenuItems = useMemo<MenuProps['items']>(() => {
    const ordered = [...workspacesWithComposerHomeStub].sort((a, b) => {
      if (a.id === HOME_WORKSPACE_ID) return -1
      if (b.id === HOME_WORKSPACE_ID) return 1
      return 0
    })
    const rows: MenuProps['items'] = ordered.map((w) => ({
      key: w.id,
      label: w.id === HOME_WORKSPACE_ID ? '主目录' : w.name,
      disabled: w.id === composerSelectedWorkspaceId
    }))
    return [
      ...(rows ?? []),
      { type: 'divider' },
      {
        key: '__pick__',
        label: '添加工作区…',
        icon: <FolderOpenOutlined />
      }
    ]
  }, [composerSelectedWorkspaceId, workspacesWithComposerHomeStub])

  const sendAgentText = useCallback(
    async (text: string, mode: AgentComposerMode, sendOpts?: { planMarkdown?: string }) => {
      const t = text.trim()
      if (!t) return
      const activeWorkspace = workspacesWithComposerHomeStub.find(
        (x) => x.id === composerSelectedWorkspaceId
      )
      if (!activeWorkspace?.path) {
        msgApi.warning('请先为当前工作区绑定路径')
        return
      }
      let sessionId: string
      /** 空白首发已在 setActiveId 前写入乐观 user，避免后续重复追加 */
      let userMessageAppended = false
      if (activeId) {
        sessionId = activeId
      } else {
        if (blankCreateInFlightRef.current) return
        blankCreateInFlightRef.current = true
        try {
          // 空白对话首发：临时名与首条消息一致（截断），随后由 Native 异步正式命名
          const provisional = t.replace(/\s+/g, ' ').trim().slice(0, 50) || '新会话'
          const created = await apiCreateSession(composerSelectedWorkspaceId, provisional)
          sessionId = created.id
          // 必须在 setActiveId / await 之前标记 hydrate 并乐观追加，
          // 否则 activeId effect 会拉到空 messages 并覆盖本地回显
          hydratedMessageSessions.current.add(sessionId)
          setMessages((m) => {
            const cur = m[sessionId] ?? []
            return {
              ...m,
              [sessionId]: [...cur, { id: randomId(), role: 'user' as const, content: t }]
            }
          })
          userMessageAppended = true
          setActiveId(sessionId)
          await refreshSessionsForWorkspace(composerSelectedWorkspaceId)
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error)
          msgApi.error(`创建会话失败：${msg}`)
          return
        } finally {
          blankCreateInFlightRef.current = false
        }
      }
      if (running[sessionId] || sendInFlightRef.current.has(sessionId)) {
        msgApi.warning('当前会话已有智能体在运行，请等待完成或停止后再发送')
        return
      }
      sendInFlightRef.current.add(sessionId)
      if (!userMessageAppended) {
        hydratedMessageSessions.current.add(sessionId)
        setMessages((m) => {
          const cur = m[sessionId] ?? []
          return {
            ...m,
            [sessionId]: [...cur, { id: randomId(), role: 'user' as const, content: t }]
          }
        })
      }
      try {
        const r = await apiSendAgentMessage(
          sessionId,
          t,
          {
            mode,
            workspacePath: activeWorkspace.path,
            ...(mode === 'build' && sendOpts?.planMarkdown?.trim()
              ? { planMarkdown: sendOpts.planMarkdown.trim() }
              : {})
          },
          handleStream
        )
        if (!r.ok) {
          msgApi.error('发送失败: ' + r.error)
          setMessages((m) => {
            const cur = m[sessionId] ?? []
            return {
              ...m,
              [sessionId]: appendAssistantText(cur, `发送失败：${r.error}`, true)
            }
          })
        } else {
          // 自动命名等副作用落库后刷新侧栏
          await refreshSessionsForWorkspace(composerSelectedWorkspaceId)
        }
      } finally {
        sendInFlightRef.current.delete(sessionId)
      }
    },
    [
      activeId,
      composerSelectedWorkspaceId,
      handleStream,
      msgApi,
      refreshSessionsForWorkspace,
      running,
      setActiveId,
      workspacesWithComposerHomeStub
    ]
  )

  const send = async () => {
    const t = input.trim()
    if (!t || sendClickLockRef.current) return
    sendClickLockRef.current = true
    setSlashToken(null)
    try {
      // 先创建/发送再清空输入，避免空白会话侧栏名在 activeId 置位前闪成「新会话」
      await sendAgentText(t, composerMode)
      setInput('')
    } finally {
      sendClickLockRef.current = false
    }
  }

  /**
   * 停止当前会话进行中的智能体运行。
   */
  const stopRun = useCallback(() => {
    if (!activeId) return
    void apiCancelAgent(activeId)
  }, [activeId])

  /**
   * 重新编辑用户消息：截断该消息之后的回合，替换正文并重跑。
   *
   * @param messageId - 用户消息 id
   * @param text - 编辑后的文本
   */
  const editResendUserMessage = useCallback(
    async (messageId: string, text: string) => {
      const t = text.trim()
      if (!t || !activeId) return

      const activeWorkspace = workspacesWithComposerHomeStub.find(
        (x) => x.id === composerSelectedWorkspaceId
      )
      if (!activeWorkspace?.path) {
        msgApi.warning('请先为当前工作区绑定路径')
        return
      }

      const sessionId = activeId
      if (running[sessionId]) {
        await apiCancelAgent(sessionId)
      }
      if (sendInFlightRef.current.has(sessionId)) {
        msgApi.warning('当前会话正在发送中，请稍后再试')
        return
      }

      const cur = messages[sessionId] ?? []
      const idx = cur.findIndex((m) => m.id === messageId)
      if (idx < 0 || cur[idx]?.role !== 'user') {
        msgApi.warning('找不到要编辑的消息')
        return
      }

      let userOrdinal = -1
      for (let i = 0; i <= idx; i += 1) {
        if (cur[i]?.role === 'user') userOrdinal += 1
      }
      if (userOrdinal < 0) return

      const truncated: ChatMessage[] = [
        ...cur.slice(0, idx),
        { ...cur[idx]!, content: t, aguiEvents: undefined }
      ]
      sendInFlightRef.current.add(sessionId)
      hydratedMessageSessions.current.add(sessionId)
      setMessages((m) => ({ ...m, [sessionId]: truncated }))
      setLiveAguiEvents((prev) => ({ ...prev, [sessionId]: [] }))
      setRunning((r) => ({ ...r, [sessionId]: false }))
      streamBuf.current[sessionId] = ''
      assistantMsgId.current[sessionId] = null

      try {
        const r = await apiSendAgentMessage(
          sessionId,
          t,
          {
            mode: composerMode,
            workspacePath: activeWorkspace.path,
            editUserOrdinal: userOrdinal
          },
          handleStream
        )
        if (!r.ok) {
          msgApi.error('发送失败: ' + r.error)
          setMessages((m) => {
            const list = m[sessionId] ?? []
            return {
              ...m,
              [sessionId]: appendAssistantText(list, `发送失败：${r.error}`, true)
            }
          })
        } else {
          await refreshSessionsForWorkspace(composerSelectedWorkspaceId)
        }
      } finally {
        sendInFlightRef.current.delete(sessionId)
      }
    },
    [
      activeId,
      composerMode,
      composerSelectedWorkspaceId,
      handleStream,
      messages,
      msgApi,
      refreshSessionsForWorkspace,
      running,
      workspacesWithComposerHomeStub
    ]
  )

  const currentMessages = useMemo(
    () => (activeId ? (messages[activeId] ?? []) : []),
    [activeId, messages]
  )
  const currentTimeline = useMemo(
    () => (activeId ? (timeline[activeId] ?? []) : []),
    [activeId, timeline]
  )
  const isRun = activeId ? running[activeId] : false
  const currentRunStats = activeId ? runStats[activeId] : undefined
  const hasInput = input.trim().length > 0
  const canSend = !isRun && hasInput
  const showSendButton = !isRun
  const showStopButton = Boolean(activeId && isRun)
  const activeWorkspace = useMemo(
    () => workspacesWithComposerHomeStub.find((w) => w.id === composerSelectedWorkspaceId),
    [composerSelectedWorkspaceId, workspacesWithComposerHomeStub]
  )

  useEffect(() => {
    if (!preloadOk || !didInitialWorkspaceLoadRef.current) return
    if (activeWorkspaceId != null) return
    activateWorkspaceLocal(HOME_WORKSPACE_ID)
  }, [activateWorkspaceLocal, activeWorkspaceId, preloadOk])
  const isEmptyConversation = currentMessages.length === 0

  const activePlanDraft = activeId ? planDrafts[activeId] : undefined

  /**
   * 用当前编辑后的计划触发 Build 执行（第二次 run）。
   */
  const buildApprovedPlan = useCallback(async () => {
    if (!activeId || !activePlanDraft?.markdown.trim()) {
      msgApi.warning('暂无计划可构建')
      return
    }
    if (planBuilding || isRun) return
    setPlanBuilding(true)
    setComposerMode('build')
    try {
      await sendAgentText('请按已批准的实施计划执行。', 'build', {
        planMarkdown: activePlanDraft.markdown
      })
    } finally {
      setPlanBuilding(false)
    }
  }, [activeId, activePlanDraft, isRun, msgApi, planBuilding, sendAgentText])

  /**
   * 将当前计划保存到工作区 `.openworker/plans/`。
   */
  const savePlanToWorkspace = useCallback(async () => {
    if (!activePlanDraft?.markdown.trim()) {
      msgApi.warning('暂无计划可保存')
      return
    }
    if (planSaving) return
    setPlanSaving(true)
    try {
      const slugBase =
        (activePlanDraft.title || 'plan')
          .toLowerCase()
          .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 48) || 'plan'
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      const relativePath = `.openworker/plans/${slugBase}-${stamp}.md`
      const result = await apiWriteWorkspaceFile(
        composerSelectedWorkspaceId,
        relativePath,
        activePlanDraft.markdown.trim() + '\n'
      )
      msgApi.success(`已保存到 ${result.path}`)
    } catch (error) {
      msgApi.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPlanSaving(false)
    }
  }, [activePlanDraft, composerSelectedWorkspaceId, msgApi, planSaving])

  const planCard =
    activeId && activePlanDraft ? (
      <div className="app-plan-card" data-testid="plan-card">
        <div className="app-plan-card-header">
          <div className="app-plan-card-title">{activePlanDraft.title?.trim() || '实施计划'}</div>
          <div className="app-plan-card-actions">
            <Button size="small" onClick={() => void savePlanToWorkspace()} loading={planSaving}>
              保存到工作区
            </Button>
            <Button
              type="primary"
              size="small"
              className="app-plan-card-build-btn"
              onClick={() => void buildApprovedPlan()}
              loading={planBuilding}
              disabled={Boolean(isRun)}
            >
              开始构建
            </Button>
          </div>
        </div>
        <TextArea
          className="app-plan-card-editor"
          value={activePlanDraft.markdown}
          onChange={(e) => {
            const markdown = e.target.value
            setPlanDrafts((d) => ({
              ...d,
              [activeId]: { ...d[activeId]!, markdown }
            }))
          }}
          autoSize={{ minRows: 2, maxRows: 5 }}
        />
        <div className="app-plan-card-hint">
          可继续在「计划」模式追问细化，或直接编辑上文后点击「开始构建」。
        </div>
      </div>
    ) : null

  const composerWorkspaceToolbar = (
    <div className="app-composer-toolbar">
      <Dropdown
        menu={{ items: composerWorkspaceMenuItems, onClick: handleComposerWorkspaceMenuClick }}
        trigger={['click']}
      >
        <button type="button" className="app-composer-workspace-trigger" aria-haspopup="menu">
          <span className="app-composer-workspace-trigger-body">
            <span className="app-composer-workspace-name">
              {activeWorkspace?.name ?? '未选择工作区'}
            </span>
            <DownOutlined className="app-composer-workspace-trigger-chevron" aria-hidden />
          </span>
        </button>
      </Dropdown>
    </div>
  )

  const skillMenuOpen = slashToken != null

  const composerInput = (
    <div className="app-composer">
      {skillMenuOpen ? (
        <ComposerSkillMenu
          skills={filteredSkills}
          activeIndex={skillMenuActiveIndex}
          loading={skillsLoading}
          onSelect={selectSkillFromMenu}
          onActiveIndexChange={setSkillMenuActiveIndex}
        />
      ) : null}
      <div className="app-composer-inner">
        <TextArea
          ref={composerInputRef}
          value={input}
          onChange={(e) => {
            const next = e.target.value
            setInput(next)
            const cursor = e.target.selectionStart ?? next.length
            syncSlashSkillMenu(next, cursor)
          }}
          onClick={(e) => {
            const cursor = (e.target as HTMLTextAreaElement).selectionStart ?? input.length
            syncSlashSkillMenu(input, cursor)
          }}
          onKeyUp={(e) => {
            if (
              e.key === 'ArrowLeft' ||
              e.key === 'ArrowRight' ||
              e.key === 'Home' ||
              e.key === 'End'
            ) {
              syncSlashSkillMenu(input)
            }
          }}
          onBlur={() => {
            // 延迟关闭，允许菜单项 mousedown/click 先完成
            window.setTimeout(() => setSlashToken(null), 120)
          }}
          autoSize={isEmptyConversation ? { minRows: 4, maxRows: 16 } : { minRows: 1, maxRows: 12 }}
          variant="borderless"
          placeholder="输入 / 选择技能，Enter 发送，Shift+Enter 换行"
          className="app-composer-input"
          onKeyDown={(e) => {
            if (!skillMenuOpen) return
            if (e.key === 'Escape') {
              e.preventDefault()
              setSlashToken(null)
              return
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              if (!filteredSkills.length) return
              setSkillMenuActiveIndex((i) => (i + 1) % filteredSkills.length)
              return
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              if (!filteredSkills.length) return
              setSkillMenuActiveIndex(
                (i) => (i - 1 + filteredSkills.length) % filteredSkills.length
              )
              return
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              const skill = filteredSkills[skillMenuActiveIndex]
              if (skill) selectSkillFromMenu(skill)
            }
          }}
          onPressEnter={(e) => {
            if (skillMenuOpen) {
              e.preventDefault()
              return
            }
            if (!e.shiftKey) {
              e.preventDefault()
              if (!isRun) void send()
            }
          }}
        />
        <div className="app-composer-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Dropdown
              menu={{ items: composerPlusMenuItems, onClick: handleComposerPlusMenuClick }}
              trigger={['hover']}
              placement="topLeft"
            >
              <Button
                type="default"
                className="app-composer-plus-btn"
                icon={<PlusOutlined />}
                aria-label="对话模式"
              />
            </Dropdown>
            {composerMode !== 'build' ? (
              <span className="app-composer-mode-hint">{composerModeLabel(composerMode)}</span>
            ) : null}
          </div>
          <div className="app-composer-actions">
            {showSendButton && (
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={() => void send()}
                disabled={!activeWorkspace?.path || !canSend}
                className="app-send-btn"
              >
                发送
              </Button>
            )}
            {showStopButton && (
              <Button danger icon={<StopOutlined />} onClick={stopRun} className="app-stop-btn">
                停止
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  return {
    preloadOk,
    bridge,
    isWinCustomChrome,
    isRightPaneCollapsed,
    onRightPaneExpand,
    onLeftTogglePortalHostChange,
    composerSelectedWorkspaceId,
    workspacesWithComposerHomeStub,
    sessionsByWorkspace,
    activeId,
    currentRunStats,
    composerWorkspaceToolbar,
    composerInput,
    planCard,
    isEmptyConversation,
    currentMessages,
    isRun,
    currentTimeline,
    stopRun,
    editResendUserMessage
  }
}
