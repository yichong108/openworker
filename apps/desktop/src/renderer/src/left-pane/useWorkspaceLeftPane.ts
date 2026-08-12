import { App as AntdApp } from 'antd'
import type { DragEvent, MouseEvent as ReactMouseEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

import {
  apiListSessions,
  apiListWorkspaces,
  apiRemoveWorkspace,
  apiRenameSession,
  apiReorderWorkspaces,
  apiUpsertWorkspaceByPath
} from '@/renderer/src/api/native-api'
import { useUiStore } from '@/renderer/src/store/ui-store'
import { useWorkspaceStore } from '@/renderer/src/store/workspace-store'
import {
  defaultWorkspaceUiState,
  HOME_WORKSPACE_ID,
  type SessionInfo,
  type WorkspaceInfo,
  type WorkspaceUiState
} from '@/shared/ipc'

function filterSessionsForSidebar(
  list: SessionInfo[] | undefined,
  hiddenIds: string[] | undefined
): SessionInfo[] {
  const hidden = new Set(hiddenIds ?? [])
  return (list ?? []).filter((s) => !hidden.has(s.id))
}

type WorkspaceDropMarker = {
  workspaceId: string
  placement: 'before' | 'after'
}

export function useWorkspaceLeftPane() {
  const { message: msgApi, modal: modalApi } = AntdApp.useApp()
  const preloadOk = typeof window !== 'undefined' && typeof window.bridge !== 'undefined'
  const bridge = window.bridge
  /** Native HTTP 始终支持多工作区 */
  const supportsMultiWorkspaceApi = true

  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const setWorkspaces = useWorkspaceStore((s) => s.setWorkspaces)
  const sessionsByWorkspace = useWorkspaceStore((s) => s.sessionsByWorkspace)
  const mergeSessionsPatch = useWorkspaceStore((s) => s.mergeSessionsPatch)
  const updateSessionsForWorkspace = useWorkspaceStore((s) => s.updateSessionsForWorkspace)
  const expandedWorkspaceIds = useWorkspaceStore((s) => s.expandedWorkspaceIds)
  const setExpandedWorkspaceIds = useWorkspaceStore((s) => s.setExpandedWorkspaceIds)
  const toggleExpandedWorkspaceId = useWorkspaceStore((s) => s.toggleExpandedWorkspaceId)
  const addExpandedWorkspaceId = useWorkspaceStore((s) => s.addExpandedWorkspaceId)

  const activeWorkspaceId = useUiStore((s) => s.activeWorkspaceId)
  const setActiveWorkspaceId = useUiStore((s) => s.setActiveWorkspaceId)
  const activeSessionId = useUiStore((s) => s.activeSessionId)
  const setActiveSessionId = useUiStore((s) => s.setActiveSessionId)
  const inputDraft = useUiStore((s) => s.inputDraft)
  const setInputDraft = useUiStore((s) => s.setInputDraft)
  const byWorkspaceUi = useUiStore((s) => s.byWorkspace)
  /** 各会话 Agent 执行中状态（侧栏圆点转圈） */
  const runningBySessionId = useUiStore((s) => s.runningBySessionId)

  const sessionsByWorkspaceForSidebar = useMemo(() => {
    const out: Record<string, SessionInfo[]> = {}
    for (const [wid, list] of Object.entries(sessionsByWorkspace)) {
      out[wid] = filterSessionsForSidebar(list, byWorkspaceUi[wid]?.sidebarHiddenSessionIds)
    }
    // 未落库的空白对话：有输入时与输入框一致，空输入时显示「新会话」
    if (activeWorkspaceId && activeSessionId === null) {
      const draftSession: SessionInfo = {
        id: '__draft__',
        name: inputDraft.trim() === '' ? '新会话' : inputDraft,
        createdAt: 0,
        updatedAt: 0
      }
      const existing = out[activeWorkspaceId] ?? []
      out[activeWorkspaceId] = [draftSession, ...existing]
    }
    return out
  }, [sessionsByWorkspace, byWorkspaceUi, activeWorkspaceId, activeSessionId, inputDraft])

  const workspacesForSidebar = useMemo(() => {
    const homeHasSessions = (sessionsByWorkspaceForSidebar[HOME_WORKSPACE_ID] ?? []).length > 0
    if (homeHasSessions) return workspaces
    return workspaces.filter((w) => w.id !== HOME_WORKSPACE_ID)
  }, [workspaces, sessionsByWorkspaceForSidebar])

  const workspaceTreeEmptyMessage = useMemo(() => {
    if (workspacesForSidebar.length > 0) return ''
    if (workspaces.length === 0) {
      return '暂无工作区。请点击右侧「添加工作区」图标选择项目文件夹。'
    }
    return '请添加项目文件夹作为工作区；用户目录（Home）仅在已有会话记录时显示在侧栏。'
  }, [workspaces.length, workspacesForSidebar.length])

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

  const composerSelectedWorkspaceId = useMemo(
    () => activeWorkspaceId ?? HOME_WORKSPACE_ID,
    [activeWorkspaceId]
  )

  const SIDEBAR_MIN_WIDTH = 240
  const SIDEBAR_MAX_WIDTH = 560
  /** 初始默认宽度取可拖拽下限，避免启动时侧栏偏宽 */
  const SIDEBAR_DEFAULT_WIDTH = SIDEBAR_MIN_WIDTH

  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isSidebarResizing, setIsSidebarResizing] = useState(false)
  const sidebarResizeStartRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const sidebarExpandedWidthRef = useRef(SIDEBAR_DEFAULT_WIDTH)

  const [draggingWorkspaceId, setDraggingWorkspaceId] = useState<string | null>(null)
  const [workspaceDropMarker, setWorkspaceDropMarker] = useState<WorkspaceDropMarker | null>(null)

  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')

  const [settingsOpen, setSettingsOpen] = useState(false)

  /**
   * 刷新全部工作区列表，并并行拉取各工作区会话。
   */
  const refreshWorkspacesAndSessions = useCallback(async () => {
    const list = await apiListWorkspaces()
    flushSync(() => {
      setWorkspaces(list)
      setExpandedWorkspaceIds(new Set(list.map((workspace) => workspace.id)))
    })
    const entries = await Promise.all(
      list.map(async (workspace) => {
        const sessions = await apiListSessions(workspace.id)
        return [workspace.id, sessions] as const
      })
    )
    mergeSessionsPatch(Object.fromEntries(entries))
    return list
  }, [mergeSessionsPatch, setExpandedWorkspaceIds, setWorkspaces])

  /**
   * 本地激活工作区并同步文件树根路径到主进程（若可用）。
   *
   * @param workspaceId - 工作区 id
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

  useEffect(() => {
    addExpandedWorkspaceId(composerSelectedWorkspaceId)
  }, [addExpandedWorkspaceId, composerSelectedWorkspaceId])

  const pickWorkspace = useCallback(async () => {
    const result = await bridge.selectWorkspace()
    const path = typeof result?.path === 'string' ? result.path.trim() : ''
    if (!path) return
    try {
      const ws = await apiUpsertWorkspaceByPath(path)
      await refreshWorkspacesAndSessions()
      setActiveWorkspaceId(ws.id)
      void bridge.setWorkspaceFsRoot?.(path)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      msgApi.error(`添加工作区失败：${msg}`)
    }
  }, [bridge, msgApi, refreshWorkspacesAndSessions, setActiveWorkspaceId])

  const openSettings = useCallback(() => {
    setSettingsOpen(true)
  }, [])

  const handleWorkspaceToggle = useCallback(
    (workspaceId: string) => {
      toggleExpandedWorkspaceId(workspaceId)
    },
    [toggleExpandedWorkspaceId]
  )

  const handleSidebarResizeStart = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (isSidebarCollapsed) return
      if (event.button !== 0) return
      event.preventDefault()
      sidebarResizeStartRef.current = {
        startX: event.clientX,
        startWidth: sidebarWidth
      }
      setIsSidebarResizing(true)
    },
    [isSidebarCollapsed, sidebarWidth]
  )

  const handleSidebarCollapseToggle = useCallback(() => {
    setIsSidebarCollapsed((prev) => {
      if (prev) {
        setSidebarWidth(sidebarExpandedWidthRef.current)
        return false
      }
      sidebarExpandedWidthRef.current = sidebarWidth
      setSidebarWidth(0)
      return true
    })
  }, [sidebarWidth])

  useEffect(() => {
    if (!isSidebarResizing) return
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (event: MouseEvent) => {
      const dragState = sidebarResizeStartRef.current
      if (!dragState) return
      const delta = event.clientX - dragState.startX
      const nextWidth = Math.min(
        SIDEBAR_MAX_WIDTH,
        Math.max(SIDEBAR_MIN_WIDTH, dragState.startWidth + delta)
      )
      setSidebarWidth(nextWidth)
      sidebarExpandedWidthRef.current = nextWidth
    }

    const handleMouseUp = () => {
      sidebarResizeStartRef.current = null
      setIsSidebarResizing(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('blur', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('blur', handleMouseUp)
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
    }
  }, [SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH, isSidebarResizing])

  const handleSessionClick = useCallback(
    async (workspaceId: string, sessionId: string) => {
      if (workspaceId !== activeWorkspaceId) {
        const workspace = activateWorkspaceLocal(workspaceId)
        if (!workspace) {
          msgApi.error('切换工作区失败')
          return
        }
      }
      setActiveSessionId(sessionId)
    },
    [activateWorkspaceLocal, activeWorkspaceId, msgApi, setActiveSessionId]
  )

  const openBlankConversationInWorkspace = useCallback(
    async (workspaceId: string) => {
      if (!workspaceId) return
      const ws = workspacesWithComposerHomeStub.find((w) => w.id === workspaceId)
      let resolvedId = workspaceId
      if (!ws?.path) {
        const hasHome = workspacesWithComposerHomeStub.some((w) => w.id === HOME_WORKSPACE_ID)
        if (!hasHome) {
          msgApi.warning('请先添加工作区')
          return
        }
        resolvedId = HOME_WORKSPACE_ID
      }
      if (resolvedId !== activeWorkspaceId) {
        const workspace = activateWorkspaceLocal(resolvedId)
        if (!workspace) {
          msgApi.error('切换工作区失败')
          return
        }
      }
      addExpandedWorkspaceId(resolvedId)
      setActiveSessionId(null)
      setInputDraft('')
      useUiStore.getState().requestComposerFocus()
    },
    [
      activateWorkspaceLocal,
      activeWorkspaceId,
      addExpandedWorkspaceId,
      msgApi,
      setActiveSessionId,
      setInputDraft,
      workspacesWithComposerHomeStub
    ]
  )

  const openBlankConversationForActiveWorkspace = useCallback(() => {
    void (async () => {
      const cid = composerSelectedWorkspaceId
      const ws = workspacesWithComposerHomeStub.find((w) => w.id === cid)
      const targetId =
        ws?.path && cid !== HOME_WORKSPACE_ID
          ? cid
          : workspacesWithComposerHomeStub.some((w) => w.id === HOME_WORKSPACE_ID)
            ? HOME_WORKSPACE_ID
            : null
      if (!targetId) {
        msgApi.warning('请先添加工作区')
        return
      }
      await openBlankConversationInWorkspace(targetId)
    })()
  }, [
    composerSelectedWorkspaceId,
    msgApi,
    openBlankConversationInWorkspace,
    workspacesWithComposerHomeStub
  ])

  /** Ctrl+N / Cmd+N：与侧栏「新会话」一致，基于当前工作区打开空白对话 */
  useEffect(() => {
    if (!preloadOk) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.isComposing) return
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key.toLowerCase() !== 'n') return
      if (e.altKey || e.shiftKey) return
      e.preventDefault()
      openBlankConversationForActiveWorkspace()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [openBlankConversationForActiveWorkspace, preloadOk])

  const handleSessionRenameRequest = useCallback((session: SessionInfo) => {
    setRenameId(session.id)
    setRenameName(session.name)
  }, [])

  const handleRemoveWorkspaceFromSidebar = useCallback(
    (workspace: WorkspaceInfo) => {
      const isDefault = Boolean(workspace.isDefault)
      const isHome = workspace.id === HOME_WORKSPACE_ID
      modalApi.confirm({
        title: '从侧边栏移除此工作区？',
        content: isHome
          ? 'Home（用户目录）工作区下的全部会话将从本机永久删除，不会并入其他工作区。移除后不会再自动显示 Home；若需该路径仍可通过「添加工作区」选择用户目录。'
          : isDefault
            ? '默认工作区下的全部会话将从本机永久删除，不会并入其他工作区。移除后侧栏可为空，可通过「添加工作区」重新添加。'
            : '该工作区下的全部会话将从本机永久删除，不会并入其他工作区。之后可通过「添加工作区」重新选择该文件夹。',
        centered: true,
        okText: '移除',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: async () => {
          try {
            await apiRemoveWorkspace(workspace.id)
            const list = await refreshWorkspacesAndSessions()
            if (activeWorkspaceId === workspace.id) {
              const next = list.find((w) => w.id !== workspace.id) ?? null
              if (next) {
                activateWorkspaceLocal(next.id)
              } else {
                setActiveWorkspaceId(HOME_WORKSPACE_ID)
              }
            }
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            msgApi.error(`移除失败：${msg}`)
          }
        }
      })
    },
    [
      activateWorkspaceLocal,
      activeWorkspaceId,
      modalApi,
      msgApi,
      refreshWorkspacesAndSessions,
      setActiveWorkspaceId
    ]
  )

  const handleRemoveSessionFromSidebar = useCallback(
    (workspaceId: string, session: SessionInfo) => {
      const { byWorkspace, activeSessionId } = useUiStore.getState()
      const prev: WorkspaceUiState = byWorkspace[workspaceId] ?? { ...defaultWorkspaceUiState }
      const prevHidden = prev.sidebarHiddenSessionIds ?? []
      if (prevHidden.includes(session.id)) return
      const sidebarHiddenSessionIds = [...prevHidden, session.id]
      const nextWs: WorkspaceUiState = { ...prev, sidebarHiddenSessionIds }
      const nextByWorkspace = { ...byWorkspace, [workspaceId]: nextWs }
      useUiStore.setState({ byWorkspace: nextByWorkspace })
      void window.bridge.setUiState({ byWorkspace: { [workspaceId]: nextWs } })

      if (activeSessionId === session.id) {
        setActiveSessionId(null)
        setInputDraft('')
        useUiStore.getState().requestComposerFocus()
      }
    },
    [setActiveSessionId, setInputDraft]
  )

  const handleWorkspaceDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>, workspaceId: string) => {
      setDraggingWorkspaceId(workspaceId)
      setWorkspaceDropMarker(null)
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', workspaceId)
    },
    []
  )

  const handleWorkspaceDragEnd = useCallback(() => {
    setDraggingWorkspaceId(null)
    setWorkspaceDropMarker(null)
  }, [])

  const handleWorkspaceDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>, workspaceId: string) => {
      if (!draggingWorkspaceId || draggingWorkspaceId === workspaceId) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      const rect = event.currentTarget.getBoundingClientRect()
      const midpoint = rect.top + rect.height / 2
      const placement: WorkspaceDropMarker['placement'] =
        event.clientY < midpoint ? 'before' : 'after'
      setWorkspaceDropMarker((prev) => {
        if (prev?.workspaceId === workspaceId && prev.placement === placement) return prev
        return { workspaceId, placement }
      })
    },
    [draggingWorkspaceId]
  )

  const handleWorkspaceDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>, targetWorkspaceId: string) => {
      event.preventDefault()
      const sourceWorkspaceId =
        draggingWorkspaceId || event.dataTransfer.getData('text/plain') || null

      const placement: WorkspaceDropMarker['placement'] =
        workspaceDropMarker?.workspaceId === targetWorkspaceId
          ? workspaceDropMarker.placement
          : 'before'

      setWorkspaceDropMarker(null)
      setDraggingWorkspaceId(null)

      if (!sourceWorkspaceId || sourceWorkspaceId === targetWorkspaceId) return
      const sourceIndex = workspaces.findIndex((x) => x.id === sourceWorkspaceId)
      const targetIndex = workspaces.findIndex((x) => x.id === targetWorkspaceId)
      if (sourceIndex < 0 || targetIndex < 0) return

      const next = [...workspaces]
      const [dragged] = next.splice(sourceIndex, 1)
      if (!dragged) return
      const normalizedTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex
      const insertIndex = placement === 'after' ? normalizedTargetIndex + 1 : normalizedTargetIndex
      next.splice(insertIndex, 0, dragged)
      const nextIds = next.map((x) => x.id)

      setWorkspaces(next)
      try {
        const list = await apiReorderWorkspaces(nextIds)
        setWorkspaces(list)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        msgApi.error(`重排失败：${msg}`)
        void refreshWorkspacesAndSessions()
      }
    },
    [
      draggingWorkspaceId,
      msgApi,
      refreshWorkspacesAndSessions,
      setWorkspaces,
      workspaceDropMarker,
      workspaces
    ]
  )

  const renameModal = {
    renameId,
    renameName,
    setRenameName,
    closeRename: () => setRenameId(null),
    confirmRename: () => {
      const v = renameName.trim()
      if (renameId && v) {
        void (async () => {
          try {
            await apiRenameSession(renameId, v)
            setRenameId(null)
            const workspaceId = activeWorkspaceId
            if (workspaceId) {
              const list = await apiListSessions(workspaceId)
              updateSessionsForWorkspace(workspaceId, list)
            }
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            msgApi.error(`重命名失败：${msg}`)
          }
        })()
      }
    }
  }

  return {
    preloadOk,
    supportsMultiWorkspaceApi,
    sidebarWidth,
    isSidebarCollapsed,
    isSidebarResizing,
    activeWorkspaceId,
    activeSessionId,
    runningBySessionId,
    byWorkspaceUi,
    workspacesForSidebar,
    workspaceTreeEmptyMessage,
    sessionsByWorkspaceForSidebar,
    expandedWorkspaceIds,
    draggingWorkspaceId,
    workspaceDropMarker,
    pickWorkspace,
    handleSidebarResizeStart,
    handleSidebarCollapseToggle,
    openSettings,
    openBlankConversationForActiveWorkspace,
    handleWorkspaceToggle,
    handleWorkspaceDragStart,
    handleWorkspaceDragOver,
    handleWorkspaceDrop,
    handleWorkspaceDragEnd,
    openBlankConversationInWorkspace,
    handleSessionClick,
    handleSessionRenameRequest,
    handleRemoveSessionFromSidebar,
    handleRemoveWorkspaceFromSidebar: supportsMultiWorkspaceApi
      ? handleRemoveWorkspaceFromSidebar
      : undefined,
    settingsOpen,
    closeSettings: () => setSettingsOpen(false),
    renameModal
  }
}
