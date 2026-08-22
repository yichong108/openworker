/**
 * Desktop 主进程入口 — 瘦壳：窗口 / 选目录 / 文件树 / UI 状态 / 拉起 Native。
 * Agent 与业务数据面已迁至 @openworker/native（Renderer 直连 HTTP/SSE）。
 */

import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import '@/main/env-bootstrap'
import '@/main/app-identity'
import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from 'electron'

import { mainLog } from '@/main/logger'
import { startNativeService, stopNativeService } from '@/main/native-service'
import { getUiState, setUiState } from '@/main/store'
import { listWorkspaceFileTree, readWorkspaceFileContent } from '@/main/workspace-files'
import {
  type AboutAppInfo,
  IPC,
  type RendererUiState,
  type WebEditAction,
  type WindowChromeAction
} from '@/shared/ipc'

mainLog.info('Electron 主进程启动')

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
    osLine: `${os.type()} ${os.release()} (${os.arch()})`
  }
}

/**
 * Chromium 叠加 / Fluent 滚动条由系统层绘制时，会忽略渲染进程里的 ::-webkit-scrollbar。
 * 关闭后使用经典滚动条轨道，聊天区等自定义 scrollbar 才能稳定生效（尤其 Windows）。
 */
app.commandLine.appendSwitch(
  'disable-features',
  'OverlayScrollbar,FluentOverlayScrollbars,FluentScrollbar'
)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged
let mainWindow: BrowserWindow | null = null

/** 与 IPC `WINDOW_CAPTION_CONTROLS` 同步 */
let mainWindowNativeControlsEnabled = true
let applicationIsQuitting = false

/** 渲染层激活工作区后设置的文件树根路径 */
let workspaceFsRoot: string | null = null

/**
 * 解析应用图标路径
 *
 * @returns 图标绝对路径；找不到时为 undefined
 */
function getAppIconPath(): string | undefined {
  if (app.isPackaged) {
    const packaged = path.join(process.resourcesPath, 'app-icon.png')
    if (existsSync(packaged)) return packaged
    return undefined
  }
  const devPath = path.join(__dirname, '../../resources/app-icon.png')
  if (existsSync(devPath)) return devPath
  return undefined
}

/**
 * Windows 控制台 UTF-8
 */
function setupConsoleUtf8(): void {
  if (process.platform !== 'win32') return
  process.env['LANG'] = process.env['LANG'] || 'zh_CN.UTF-8'
  process.stdout.setDefaultEncoding('utf8')
  process.stderr.setDefaultEncoding('utf8')
}

setupConsoleUtf8()

/** 与 `createWindow` 中 `titleBarOverlay` 一致 */
const WIN_TITLE_BAR_OVERLAY = {
  color: '#f5f5f5',
  symbolColor: '#000000d9',
  height: 32
} as const

/** 弹层打开时收起 WCO */
const WIN_TITLE_BAR_OVERLAY_SUPPRESSED = {
  height: 0,
  color: '#00000000',
  symbolColor: '#00000000'
} as const

/**
 * 弹窗打开时去掉系统标题栏按钮区。
 *
 * @param win - BrowserWindow
 * @param enabled - 是否启用原生控制
 */
function applyNativeWindowControlsEnabled(win: BrowserWindow | null, enabled: boolean): void {
  mainWindowNativeControlsEnabled = enabled
  if (!win || win.isDestroyed()) return
  try {
    if (process.platform === 'darwin') {
      win.setWindowButtonVisibility(enabled)
    }
    win.setMinimizable(enabled)
    win.setMaximizable(enabled)
    win.setClosable(enabled)
    if (process.platform === 'win32') {
      if (enabled) {
        win.setTitleBarOverlay({ ...WIN_TITLE_BAR_OVERLAY })
      } else {
        win.setTitleBarOverlay({ ...WIN_TITLE_BAR_OVERLAY_SUPPRESSED })
        setTimeout(() => {
          try {
            if (win.isDestroyed()) return
            if (mainWindowNativeControlsEnabled) return
            win.setTitleBarOverlay({ ...WIN_TITLE_BAR_OVERLAY_SUPPRESSED })
          } catch {
            /* ignore */
          }
        }, 32)
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    mainLog.warn('[window:caption-controls] 应用窗口控制状态失败:', msg)
  }
}

/**
 * 开发模式加载 React DevTools
 */
async function loadDevtoolsExtension(): Promise<void> {
  if (!isDev) return

  const extensionPath = path.resolve(__dirname, '../../src/extensions/react-devtools')

  try {
    const all = session.defaultSession.getAllExtensions()
    for (const ext of all) {
      if (ext.name.toLowerCase().includes('react developer tools')) {
        session.defaultSession.removeExtension(ext.id)
      }
    }
  } catch {
    /* ignore */
  }

  if (existsSync(extensionPath)) {
    try {
      await session.defaultSession.loadExtension(extensionPath, { allowFileAccess: true })
      mainLog.info('[react-devtools] 本地离线扩展加载成功')
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      mainLog.error('[react-devtools] 本地扩展加载失败:', msg)
    }
  }
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

/**
 * 创建主窗口
 */
function createWindow(): void {
  const webPreferences = {
    preload: path.join(__dirname, '../preload/index.cjs'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true
  }
  const win32Chrome =
    process.platform === 'win32'
      ? ({
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: { ...WIN_TITLE_BAR_OVERLAY }
        } as const)
      : {}
  const appIcon = getAppIconPath()
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    webPreferences,
    show: false,
    ...(appIcon ? { icon: appIcon } : {}),
    ...win32Chrome
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return
      mainLog.error(
        `[renderer] load failed code=${errorCode} desc=${errorDescription} url=${validatedURL}`
      )
    }
  )
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    mainLog.error(`[renderer] process gone: reason=${details.reason}, exitCode=${details.exitCode}`)
  })
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.maximize()
    mainWindow?.show()
  })
  mainWindow.on('close', (e) => {
    if (applicationIsQuitting) return
    if (!mainWindowNativeControlsEnabled) {
      e.preventDefault()
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/**
 * 注册 Electron 壳 IPC
 */
function registerIpc(): void {
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
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow
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
    const win =
      mainWindow && !mainWindow.isDestroyed() ? mainWindow : BrowserWindow.getFocusedWindow()
    applyNativeWindowControlsEnabled(win, visible === true)
    event.returnValue = true
  })

  ipcMain.handle(IPC.WINDOW_ACTION, (_e, action: WindowChromeAction) => {
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow
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
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow
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

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return
  if (process.platform === 'win32') {
    Menu.setApplicationMenu(null)
  }
  void (async () => {
    await loadDevtoolsExtension()
    await startNativeService()
    registerIpc()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })()
})

app.on('before-quit', () => {
  applicationIsQuitting = true
  stopNativeService()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
})
