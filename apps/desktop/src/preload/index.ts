import { contextBridge, ipcRenderer } from 'electron'

import { createLogWrite } from '@/preload/log-bridge'
import {
  type AboutAppInfo,
  IPC,
  type RendererUiState,
  type WebEditAction,
  type WindowChromeAction,
  type WorkspaceFileContentResult,
  type WorkspaceFileTreePayload
} from '@/shared/ipc-shell'

const api = {
  logWrite: createLogWrite(),
  /** 渲染进程用于判断是否启用 Windows 自定义标题栏菜单 */
  platform: process.platform,
  windowAction: (action: WindowChromeAction) =>
    ipcRenderer.invoke(IPC.WINDOW_ACTION, action) as Promise<void>,
  /** 为 true 时允许原生最小化/最大化/关闭；antd 弹层打开时由渲染进程置为 false */
  setCaptionControlsVisible: (visible: boolean) => {
    ipcRenderer.sendSync(IPC.WINDOW_CAPTION_CONTROLS, visible)
  },
  webEdit: (action: WebEditAction) => ipcRenderer.invoke(IPC.WEB_EDIT, action) as Promise<void>,
  showAbout: () => ipcRenderer.invoke(IPC.APP_ABOUT) as Promise<AboutAppInfo>,
  /** 系统目录选择对话框；仅返回 path */
  selectWorkspace: () => ipcRenderer.invoke(IPC.WORKSPACE_SELECT) as Promise<{ path: string }>,
  /**
   * 设置主进程文件树所用绝对根路径
   *
   * @param rootPath - 工作区绝对路径；null 表示清除
   */
  setWorkspaceFsRoot: (rootPath: string | null) =>
    ipcRenderer.invoke(IPC.WORKSPACE_FS_ROOT, rootPath) as Promise<{
      ok: true
    }>,
  /**
   * 列出工作区文件树
   *
   * @param rootPath - 可选绝对根路径
   */
  getWorkspaceFileTree: (rootPath?: string) =>
    ipcRenderer.invoke(IPC.WORKSPACE_FILE_TREE, rootPath) as Promise<WorkspaceFileTreePayload>,
  /**
   * 读取工作区内相对路径文件
   *
   * @param rootPath - 工作区绝对根路径
   * @param relPath - 相对路径
   */
  readWorkspaceFile: (rootPath: string, relPath: string) =>
    ipcRenderer.invoke(
      IPC.WORKSPACE_FILE_CONTENT,
      rootPath,
      relPath
    ) as Promise<WorkspaceFileContentResult>,
  getUiState: () => ipcRenderer.invoke(IPC.UI_STATE_GET) as Promise<RendererUiState>,
  setUiState: (patch: Partial<RendererUiState>) =>
    ipcRenderer.invoke(IPC.UI_STATE_SET, patch) as Promise<RendererUiState>,
  toggleDevtools: () => ipcRenderer.invoke(IPC.DEVTOOLS_TOGGLE) as Promise<{ open: boolean }>,
  openExternal: (url: string) =>
    ipcRenderer.invoke(IPC.EXTERNAL_OPEN, url) as Promise<{ ok: boolean }>
}

contextBridge.exposeInMainWorld('bridge', api)

export type OpenworkerApi = typeof api
