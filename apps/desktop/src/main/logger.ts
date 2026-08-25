import { createLogger, initRootLogger, writeLogEntry, type Logger } from '@openworker/log'
import { getOpenworkerDir, getOpenworkerLogPath } from '@openworker/shared/load-env'
import { app, ipcMain } from 'electron'

type RendererLogPayload = {
  level: 'debug' | 'info' | 'warn' | 'error'
  module: string
  msg?: string
  bindings?: Record<string, unknown>
}

let initialized = false

function registerLogIpc(): void {
  ipcMain.on('log:write', (_event, raw: unknown) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return
    const payload = raw as Partial<RendererLogPayload>
    const level = payload.level
    if (level !== 'debug' && level !== 'info' && level !== 'warn' && level !== 'error') return
    const moduleName = typeof payload.module === 'string' ? payload.module : 'desktop:renderer'
    writeLogEntry({
      level,
      module: moduleName,
      msg: typeof payload.msg === 'string' ? payload.msg : undefined,
      bindings:
        payload.bindings && typeof payload.bindings === 'object' && !Array.isArray(payload.bindings)
          ? (payload.bindings as Record<string, unknown>)
          : undefined
    })
  })
}

function registerProcessErrorHandlers(log: Logger): void {
  process.on('uncaughtException', (error) => {
    log.error('uncaughtException', error)
  })
  process.on('unhandledRejection', (reason) => {
    log.error('unhandledRejection', reason)
  })
}

/**
 * 配置主进程 pino 日志。
 * 落盘使用 {@link getOpenworkerLogPath}（与 Native/SQLite 同数据根），不用 Electron `app.getPath('logs')`。
 */
export function initMainLogger(): void {
  if (initialized) return
  initialized = true

  const logFile = getOpenworkerLogPath()
  initRootLogger({
    console: true,
    file: logFile,
    stdoutJson: false
  })

  registerLogIpc()
  const boot = createLogger('desktop:main')
  registerProcessErrorHandlers(boot)
  boot.info({ logFile }, '主进程日志已就绪')
  logAppDirectoriesToConsole(boot)
}

/** 始终在终端打印，便于定位日志与数据目录（不受日志级别影响） */
function logAppDirectoriesToConsole(log: Logger): void {
  const emit = (): void => {
    try {
      console.log('[openworker] 数据根 (日志/SQLite/MCP):', getOpenworkerDir())
      console.log('[openworker] 日志文件:', getOpenworkerLogPath())
      console.log('[openworker] Electron userData (壳/UI 状态):', app.getPath('userData'))
    } catch (e) {
      log.warn('读取 app 路径失败', e)
    }
  }
  if (app.isReady()) {
    emit()
  } else {
    app.once('ready', emit)
  }
}

initMainLogger()

/** 按模块划分 scope，便于检索 */
export function logScope(scope: string): Logger {
  return createLogger(`desktop:${scope}`)
}

/** 主进程默认记录器 */
export const mainLog = createLogger('desktop:main')

export { writeLogEntry, parseJsonLogLine } from '@openworker/log'
