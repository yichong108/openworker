import { create } from 'zustand'

import {
  defaultWorkspaceUiState,
  type SessionUnreadKind,
  type WorkspaceUiState
} from '@/shared/ipc'

type UiStoreState = {
  activeWorkspaceId: string | null
  activeSessionId: string | null
  inputDraft: string
  /** 递增以触发主区域对话输入框聚焦（如新会话） */
  composerFocusNonce: number
  /**
   * 会话是否正在 Agent 执行中（RUN_STARTED → 结束）
   * 仅内存态，不持久化；供中栏与侧栏会话圆点共用
   */
  runningBySessionId: Record<string, boolean>
  byWorkspace: Record<string, WorkspaceUiState>
  hydrated: boolean
  hydrateFromMain: () => Promise<void>
  setActiveWorkspaceId: (workspaceId: string | null) => void
  setActiveSessionId: (id: string | null) => void
  setInputDraft: (text: string) => void
  requestComposerFocus: () => void
  /**
   * 更新指定会话的执行中状态
   *
   * @param sessionId - 会话 id
   * @param running - 是否正在执行（AI 答复中）
   */
  setSessionRunning: (sessionId: string, running: boolean) => void
  /**
   * 标记会话未读（持久化到 byWorkspace）
   *
   * @param workspaceId - 工作区 id
   * @param sessionId - 会话 id
   * @param kind - plan 橙色 / other 蓝色
   */
  setSessionUnread: (workspaceId: string, sessionId: string, kind: SessionUnreadKind) => void
  /**
   * 清除会话未读并持久化
   *
   * @param workspaceId - 工作区 id
   * @param sessionId - 会话 id
   */
  clearSessionUnread: (workspaceId: string, sessionId: string) => void
}

let draftTimer: ReturnType<typeof setTimeout> | null = null

function persistPatch(
  patch: Partial<{
    activeWorkspaceId: string | null
    byWorkspace: Record<string, WorkspaceUiState>
  }>
): void {
  if (typeof window === 'undefined' || typeof window.bridge === 'undefined') return
  void window.bridge.setUiState(patch)
}

function resolveWorkspaceUiState(
  workspaceId: string | null,
  byWorkspace: Record<string, WorkspaceUiState>
): WorkspaceUiState {
  if (!workspaceId) return { ...defaultWorkspaceUiState }
  return byWorkspace[workspaceId] || { ...defaultWorkspaceUiState }
}

/**
 * 从工作区 UI 状态中移除指定会话的未读标记
 *
 * @param prev - 当前工作区 UI 状态
 * @param sessionId - 要清除的会话 id
 * @returns 清除后的工作区状态；若原本无该未读则原样返回
 */
function withoutSessionUnread(prev: WorkspaceUiState, sessionId: string): WorkspaceUiState {
  const unread = prev.unreadBySessionId
  if (!unread || !(sessionId in unread)) return prev
  const nextUnread = { ...unread }
  delete nextUnread[sessionId]
  return { ...prev, unreadBySessionId: nextUnread }
}

export const useUiStore = create<UiStoreState>((set, get) => ({
  activeWorkspaceId: null,
  activeSessionId: null,
  inputDraft: '',
  composerFocusNonce: 0,
  runningBySessionId: {},
  byWorkspace: {},
  hydrated: false,
  hydrateFromMain: async () => {
    if (typeof window === 'undefined' || typeof window.bridge === 'undefined') {
      set({ hydrated: true })
      return
    }
    const persisted = await window.bridge.getUiState()
    const activeWorkspaceId = persisted.activeWorkspaceId ?? null
    const byWorkspace = persisted.byWorkspace || {}
    let byWorkspaceHydrated = byWorkspace
    const workspaceUiState = resolveWorkspaceUiState(activeWorkspaceId, byWorkspace)
    // 恢复时当前正在查看的会话视为已读，清除其未读并写回
    if (activeWorkspaceId && workspaceUiState.activeSessionId) {
      const cleared = withoutSessionUnread(workspaceUiState, workspaceUiState.activeSessionId)
      if (cleared !== workspaceUiState) {
        byWorkspaceHydrated = {
          ...byWorkspace,
          [activeWorkspaceId]: cleared
        }
        persistPatch({ byWorkspace: { [activeWorkspaceId]: cleared } })
      }
    }
    const hydratedWs = resolveWorkspaceUiState(activeWorkspaceId, byWorkspaceHydrated)
    set({
      activeWorkspaceId,
      activeSessionId: hydratedWs.activeSessionId,
      inputDraft: hydratedWs.inputDraft,
      byWorkspace: byWorkspaceHydrated,
      hydrated: true
    })
  },
  setActiveWorkspaceId: (workspaceId) => {
    if (workspaceId === get().activeWorkspaceId) return
    const currentByWorkspace = get().byWorkspace
    let nextWorkspaceState = resolveWorkspaceUiState(workspaceId, currentByWorkspace)
    let byWorkspace = currentByWorkspace
    // 切到工作区时，其当前会话视为已查看
    if (workspaceId && nextWorkspaceState.activeSessionId) {
      const cleared = withoutSessionUnread(nextWorkspaceState, nextWorkspaceState.activeSessionId)
      if (cleared !== nextWorkspaceState) {
        nextWorkspaceState = cleared
        byWorkspace = { ...currentByWorkspace, [workspaceId]: cleared }
        set({
          activeWorkspaceId: workspaceId,
          activeSessionId: nextWorkspaceState.activeSessionId,
          inputDraft: nextWorkspaceState.inputDraft,
          byWorkspace
        })
        persistPatch({
          activeWorkspaceId: workspaceId,
          byWorkspace: { [workspaceId]: cleared }
        })
        return
      }
    }
    set({
      activeWorkspaceId: workspaceId,
      activeSessionId: nextWorkspaceState.activeSessionId,
      inputDraft: nextWorkspaceState.inputDraft
    })
    persistPatch({ activeWorkspaceId: workspaceId })
  },
  setActiveSessionId: (id) => {
    const workspaceId = get().activeWorkspaceId
    if (!workspaceId) return
    const currentByWorkspace = get().byWorkspace
    const prev = resolveWorkspaceUiState(workspaceId, currentByWorkspace)
    // 切到会话时清除该会话未读，与 activeSessionId 同一次持久化
    const cleared = id != null ? withoutSessionUnread(prev, id) : prev
    const nextWs = { ...cleared, activeSessionId: id }
    const sameSession = id === get().activeSessionId
    if (sameSession && cleared === prev) return
    const byWorkspace = {
      ...currentByWorkspace,
      [workspaceId]: nextWs
    }
    set({ activeSessionId: id, byWorkspace })
    persistPatch({ byWorkspace: { [workspaceId]: nextWs } })
  },
  setInputDraft: (text) => {
    const workspaceId = get().activeWorkspaceId
    if (!workspaceId) {
      set({ inputDraft: text })
      return
    }
    const currentByWorkspace = get().byWorkspace
    const prev = resolveWorkspaceUiState(workspaceId, currentByWorkspace)
    const byWorkspace = {
      ...currentByWorkspace,
      [workspaceId]: { ...prev, inputDraft: text }
    }
    set({ inputDraft: text, byWorkspace })
    if (draftTimer) clearTimeout(draftTimer)
    draftTimer = setTimeout(() => {
      persistPatch({ byWorkspace: { [workspaceId]: byWorkspace[workspaceId]! } })
      draftTimer = null
    }, 150)
  },
  requestComposerFocus: () => set((s) => ({ composerFocusNonce: s.composerFocusNonce + 1 })),
  setSessionRunning: (sessionId, running) =>
    set((s) => {
      if (Boolean(s.runningBySessionId[sessionId]) === running) return s
      return {
        runningBySessionId: { ...s.runningBySessionId, [sessionId]: running }
      }
    }),
  setSessionUnread: (workspaceId, sessionId, kind) => {
    const currentByWorkspace = get().byWorkspace
    const prev = resolveWorkspaceUiState(workspaceId, currentByWorkspace)
    if (prev.unreadBySessionId?.[sessionId] === kind) return
    const nextWs: WorkspaceUiState = {
      ...prev,
      unreadBySessionId: { ...(prev.unreadBySessionId ?? {}), [sessionId]: kind }
    }
    const byWorkspace = { ...currentByWorkspace, [workspaceId]: nextWs }
    set({ byWorkspace })
    persistPatch({ byWorkspace: { [workspaceId]: nextWs } })
  },
  clearSessionUnread: (workspaceId, sessionId) => {
    const currentByWorkspace = get().byWorkspace
    const prev = resolveWorkspaceUiState(workspaceId, currentByWorkspace)
    const nextWs = withoutSessionUnread(prev, sessionId)
    if (nextWs === prev) return
    const byWorkspace = { ...currentByWorkspace, [workspaceId]: nextWs }
    set({ byWorkspace })
    persistPatch({ byWorkspace: { [workspaceId]: nextWs } })
  }
}))
