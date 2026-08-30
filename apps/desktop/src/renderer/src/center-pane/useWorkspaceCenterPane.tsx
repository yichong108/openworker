import { filterSessionsForSidebar, PRELOAD_MISSING_ERROR } from './center-pane-utils'
import { DownOutlined, FolderOpenOutlined } from '@ant-design/icons'
import { App as AntdApp, Dropdown, type MenuProps } from 'antd'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { flushSync } from 'react-dom'

import {
  apiListSessions,
  apiListWorkspaces,
  apiUpsertWorkspaceByPath
} from '@/renderer/src/api/native-api'
import { useUiStore } from '@/renderer/src/store/ui-store'
import { useWorkspaceStore } from '@/renderer/src/store/workspace-store'
import { HOME_WORKSPACE_ID, type SessionInfo, type WorkspaceInfo } from '@/shared/ipc'

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
  const setSessionsByWorkspace = useWorkspaceStore((s) => s.setSessionsByWorkspace)
  const updateSessionsForWorkspace = useWorkspaceStore((s) => s.updateSessionsForWorkspace)
  const setExpandedWorkspaceIds = useWorkspaceStore((s) => s.setExpandedWorkspaceIds)
  const activeWorkspaceId = useUiStore((s) => s.activeWorkspaceId)
  const setActiveWorkspaceId = useUiStore((s) => s.setActiveWorkspaceId)
  const activeId = useUiStore((s) => s.activeSessionId)
  const setActiveId = useUiStore((s) => s.setActiveSessionId)
  const hydrateUiStore = useUiStore((s) => s.hydrateFromMain)

  const didInitialWorkspaceLoadRef = useRef(false)

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

  const activeWorkspace = useMemo(
    () => workspacesWithComposerHomeStub.find((w) => w.id === composerSelectedWorkspaceId),
    [composerSelectedWorkspaceId, workspacesWithComposerHomeStub]
  )

  const refreshSessionsForWorkspace = useCallback(
    async (workspaceId: string) => {
      if (!workspaceId) return
      const list = await apiListSessions(workspaceId)
      updateSessionsForWorkspace(workspaceId, list)
    },
    [updateSessionsForWorkspace]
  )

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
    didInitialWorkspaceLoadRef.current = true
  }, [
    bridge,
    setActiveId,
    setActiveWorkspaceId,
    setExpandedWorkspaceIds,
    setSessionsByWorkspace,
    setWorkspaces
  ])

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
    if (!preloadOk || !didInitialWorkspaceLoadRef.current) return
    if (activeWorkspaceId != null) return
    activateWorkspaceLocal(HOME_WORKSPACE_ID)
  }, [activateWorkspaceLocal, activeWorkspaceId, preloadOk])

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

  const composerWorkspaceToolbar = (
    <div className="app-composer-toolbar">
      <Dropdown
        menu={{
          items: composerWorkspaceMenuItems,
          onClick: handleComposerWorkspaceMenuClick
        }}
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

  const handleSessionCreated = useCallback(
    (sessionId: string) => {
      setActiveId(sessionId)
    },
    [setActiveId]
  )

  return {
    preloadOk,
    isWinCustomChrome,
    isRightPaneCollapsed,
    onRightPaneExpand,
    onLeftTogglePortalHostChange,
    composerSelectedWorkspaceId,
    activeWorkspace,
    composerWorkspaceToolbar,
    activeId,
    handleSessionCreated,
    refreshSessionsForWorkspace
  }
}
