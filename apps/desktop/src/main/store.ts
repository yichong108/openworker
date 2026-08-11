/**
 * Desktop 主进程本地持久化 — 仅保留 UI 状态（electron-store）
 *
 * 工作区 / 会话 / settings / Agent 已迁至 Native；主进程不再缓存业务数据。
 */

import Store from 'electron-store'

import {
  defaultRendererUiState,
  defaultWorkspaceUiState,
  type RendererUiState,
  type WorkspaceUiState
} from '@/shared/ipc'

type StoreSchema = {
  uiState: RendererUiState
}

const store = new Store<StoreSchema>({
  name: 'openworker',
  defaults: {
    uiState: { ...defaultRendererUiState }
  }
})

/**
 * 读取 UI 状态（本地 electron-store）
 *
 * @returns RendererUiState
 */
export function getUiState(): RendererUiState {
  return store.get('uiState') ?? { ...defaultRendererUiState }
}

/**
 * 合并写入 UI 状态
 *
 * @param patch - 部分 UI 状态
 * @returns 合并后的完整状态
 */
export function setUiState(patch: Partial<RendererUiState>): RendererUiState {
  const prev = getUiState()
  const next: RendererUiState = {
    ...prev,
    ...patch,
    byWorkspace: patch.byWorkspace
      ? { ...prev.byWorkspace, ...patch.byWorkspace }
      : prev.byWorkspace
  }
  store.set('uiState', next)
  return next
}

/**
 * 读取单个工作区的 UI 状态
 *
 * @param workspaceId - 工作区 id
 */
export function getWorkspaceUiState(workspaceId: string): WorkspaceUiState {
  return getUiState().byWorkspace[workspaceId] || { ...defaultWorkspaceUiState }
}

/**
 * 写入单个工作区的 UI 状态
 *
 * @param workspaceId - 工作区 id
 * @param patch - 部分工作区 UI 状态
 */
export function setWorkspaceUiState(
  workspaceId: string,
  patch: Partial<WorkspaceUiState>
): RendererUiState {
  const current = getUiState()
  const prevWs = current.byWorkspace[workspaceId] || { ...defaultWorkspaceUiState }
  return setUiState({
    byWorkspace: {
      [workspaceId]: { ...prevWs, ...patch }
    }
  })
}
