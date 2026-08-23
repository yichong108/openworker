/**
 * Desktop 主进程入口 — 瘦壳：窗口 / 选目录 / 文件树 / UI 状态 / 拉起 Native。
 * Agent 与业务数据面已迁至 @openworker/native（Renderer 直连 HTTP/SSE）。
 */

import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import '@/main/env-bootstrap'
import { app, BrowserWindow, Menu, session, shell } from 'electron'

import { mainLog } from '@/main/logger'
import { startNativeService, stopNativeService } from '@/main/native-service'
import { registerIpc } from '@/main/register-ipc'

mainLog.info('Electron 主进程启动')

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
    if (isDev) {
      mainWindow?.webContents.openDevTools({ mode: 'bottom' })
    }
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

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return
  if (process.platform === 'win32') {
    Menu.setApplicationMenu(null)
  }
  void (async () => {
    await loadDevtoolsExtension()
    await startNativeService()
    registerIpc({
      getMainWindow: () => mainWindow,
      applyNativeWindowControlsEnabled
    })
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
