/**
 * Electron 壳层 IPC 注册 — Workspace / UI 状态 / 窗口控制 / DevTools / About。
 */

import os from 'node:os'
import path from 'node:path'

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'

import { getUiState, setUiState } from '@/main/store'
import { listWorkspaceFileTree, readWorkspaceFileContent } from '@/main/workspace-files'
import {
  type AboutAppInfo,
  IPC,
  type RendererUiState,
  type WebEditAction,
  type WindowChromeAction
} from '@/shared/ipc'

/** 渲染层激活工作区后设置的文件树根路径 */
let workspaceFsRoot: string | null = null

/**
 * 注册壳 IPC 所需的主进程依赖（避免与入口循环依赖）。
 */
export type RegisterIpcDeps = {
  getMainWindow: () => BrowserWindow | null
  applyNativeWindowControlsEnabled: (win: BrowserWindow | null, enabled: boolean) => void
}

/**
 * 收集「关于」面板信息
 *
 * @returns AboutAppInfo
 */
function collectAboutAppInfo(): AboutAppInfo {
  return {
    productName: app.getName(),
    version: app.getVersion(),
    gitCommit: __OPENWORKERER_GIT_COMMIT__,
    buildIso: __OPENWORKERER_BUILD_ISO__,
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
    node: process.versions.node ?? '',
    v8: process.versions.v8 ?? '',
    osLine: `${os.type()} ${os.arch()} ${os.release()}`
  }
}

/**
 * 注册 Electron 壳 IPC
 *
 * 用途：把 Workspace / UI / 窗口 / DevTools / About 等壳层能力挂到 ipcMain。
 * 意图：主入口只负责生命周期，IPC 通道集中在此模块注册。
 * 实现：通过 deps 读取主窗口与原生标题栏控制状态，避免与 index 循环依赖。
 *
 * @param deps - 主窗口与标题栏控制回调
 */
export function registerIpc(deps: RegisterIpcDeps): void {
  const { getMainWindow, applyNativeWindowControlsEnabled } = deps

  ipcMain.handle(IPC.WORKSPACE_SELECT, async () => {
    const r = await dialog.showOpenDialog({
      title: '选择工作区',
      properties: ['openDirectory', 'createDirectory']
    })
    if (r.canceled || !r.filePaths[0]) return { path: '' as const }
    return { path: r.filePaths[0] }
  })

  ipcMain.handle(IPC.WORKSPACE_FS_ROOT, (_e, rootPath: unknown) => {
    if (rootPath == null || rootPath === '') {
      workspaceFsRoot = null
      return { ok: true as const }
    }
    if (typeof rootPath === 'string' && rootPath.trim()) {
      workspaceFsRoot = path.resolve(rootPath.trim())
    }
    return { ok: true as const }
  })

  ipcMain.handle(IPC.WORKSPACE_FILE_TREE, async (_e, rootPath?: unknown) => {
    const root =
      typeof rootPath === 'string' && rootPath.trim()
        ? path.resolve(rootPath.trim())
        : workspaceFsRoot
    if (!root) return { rootPath: '', nodes: [] }
    return await listWorkspaceFileTree(root)
  })

  ipcMain.handle(IPC.WORKSPACE_FILE_CONTENT, async (_e, rootPath: unknown, relPath: unknown) => {
    const root =
      typeof rootPath === 'string' && rootPath.trim()
        ? path.resolve(rootPath.trim())
        : workspaceFsRoot
    if (!root) {
      return { ok: false as const, error: '当前工作区未绑定目录' }
    }
    return await readWorkspaceFileContent(root, String(relPath ?? ''))
  })

  ipcMain.handle(IPC.UI_STATE_GET, () => getUiState())
  ipcMain.handle(IPC.UI_STATE_SET, (_e, patch: Partial<RendererUiState>) => setUiState(patch))

  ipcMain.handle(IPC.DEVTOOLS_TOGGLE, () => {
    const win = BrowserWindow.getFocusedWindow() ?? getMainWindow()
    if (!win) return { open: false }
    if (win.webContents.isDevToolsOpened()) {
      win.webContents.closeDevTools()
      return { open: false }
    }
    win.webContents.openDevTools({ mode: 'bottom' })
    return { open: true }
  })

  ipcMain.handle(IPC.EXTERNAL_OPEN, async (_e, url: string) => {
    if (!url || typeof url !== 'string') return { ok: false as const }
    try {
      const parsed = new URL(url)
      if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
        return { ok: false as const }
      }
      await shell.openExternal(url)
      return { ok: true as const }
    } catch {
      return { ok: false as const }
    }
  })

  ipcMain.on(IPC.WINDOW_CAPTION_CONTROLS, (event, visible: unknown) => {
    const mainWindow = getMainWindow()
    const win =
      mainWindow && !mainWindow.isDestroyed() ? mainWindow : BrowserWindow.getFocusedWindow()
    applyNativeWindowControlsEnabled(win, visible === true)
    event.returnValue = true
  })

  ipcMain.handle(IPC.WINDOW_ACTION, (_e, action: WindowChromeAction) => {
    const win = BrowserWindow.getFocusedWindow() ?? getMainWindow()
    switch (action) {
      case 'quit':
        app.quit()
        return
      case 'reload':
        win?.webContents.reload()
        return
      case 'minimize':
        win?.minimize()
        return
      case 'maximize-toggle':
        if (!win) return
        if (win.isMaximized()) win.unmaximize()
        else win.maximize()
        return
      case 'close':
        win?.close()
        return
      default:
        return
    }
  })

  ipcMain.handle(IPC.WEB_EDIT, (_e, action: WebEditAction) => {
    const win = BrowserWindow.getFocusedWindow() ?? getMainWindow()
    const wc = win?.webContents
    if (!wc) return
    switch (action) {
      case 'undo':
        wc.undo()
        return
      case 'redo':
        wc.redo()
        return
      case 'cut':
        wc.cut()
        return
      case 'copy':
        wc.copy()
        return
      case 'paste':
        wc.paste()
        return
      case 'selectAll':
        wc.selectAll()
        return
      default:
        return
    }
  })

  ipcMain.handle(IPC.APP_ABOUT, () => collectAboutAppInfo())
}
