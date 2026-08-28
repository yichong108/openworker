import { getLogLevel, getLogModuleFilters, type LogLevel } from '@openworker/shared/load-env'
import pino, { type Logger as PinoLogger } from 'pino'

import { getLogContext } from './context.js'
import { createFileDestination } from './file-transport.js'
import { createPrettyStream } from './format.js'
import { REDACT_CENSOR, REDACT_PATHS } from './redact.js'
import type { Logger, RootLoggerOptions } from './types.js'

const PINO_LEVELS: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60
}

let rootPino: PinoLogger | null = null

function levelForModule(module: string): LogLevel {
  const filters = getLogModuleFilters()
  return filters.get(module) ?? getLogLevel()
}

function normalizeArgs(args: unknown[]): {
  obj: Record<string, unknown>
  msg?: string
} {
  if (args.length === 0) return { obj: {} }
  const [first, ...rest] = args
  if (typeof first === 'string') {
    if (
      rest.length === 1 &&
      rest[0] !== null &&
      typeof rest[0] === 'object' &&
      !Array.isArray(rest[0])
    ) {
      return { obj: rest[0] as Record<string, unknown>, msg: first }
    }
    return { obj: {}, msg: [first, ...rest].map(String).join(' ') }
  }
  if (first !== null && typeof first === 'object' && !Array.isArray(first)) {
    const msg = rest.length > 0 ? rest.map(String).join(' ') : undefined
    return { obj: first as Record<string, unknown>, msg }
  }
  return { obj: {}, msg: args.map(String).join(' ') }
}

function wrapPino(pinoLogger: PinoLogger, module: string): Logger {
  const emit = (level: 'debug' | 'info' | 'warn' | 'error', args: unknown[]) => {
    const ctx = getLogContext()
    const { obj, msg } = normalizeArgs(args)
    const bindings: Record<string, unknown> = { module, ...obj }
    if (ctx?.sessionId) bindings.sessionId = ctx.sessionId
    if (ctx?.workspaceId) bindings.workspaceId = ctx.workspaceId
    if (ctx?.requestId) bindings.requestId = ctx.requestId

    const minLevel = levelForModule(module)
    if (PINO_LEVELS[level] < PINO_LEVELS[minLevel]) return

    if (msg !== undefined) {
      pinoLogger[level](bindings, msg)
    } else {
      pinoLogger[level](bindings)
    }
  }

  return {
    debug: (...args) => emit('debug', args),
    info: (...args) => emit('info', args),
    warn: (...args) => emit('warn', args),
    error: (...args) => emit('error', args)
  }
}

/**
 * 初始化根 pino（宿主进程调用一次）。
 */
export function initRootLogger(options: RootLoggerOptions = {}): void {
  if (rootPino) return

  const level = getLogLevel()
  const streams: pino.StreamEntry[] = []

  if (options.stdoutJson) {
    streams.push({ stream: process.stdout, level })
  } else {
    if (options.console !== false) {
      streams.push({ stream: createPrettyStream(level), level })
    }
    if (options.file) {
      streams.push({ stream: createFileDestination(options.file), level })
    }
  }

  if (streams.length === 0) {
    streams.push({ stream: process.stdout, level })
  }

  rootPino = pino(
    {
      level,
      redact: { paths: [...REDACT_PATHS], censor: REDACT_CENSOR },
      base: undefined,
      timestamp: pino.stdTimeFunctions.isoTime
    },
    pino.multistream(streams)
  )
}

/** 获取根 pino（需先 initRootLogger） */
export function getRootPino(): PinoLogger {
  if (!rootPino) {
    initRootLogger({ console: true })
  }
  return rootPino!
}

/**
 * 创建带 module 绑定的 Logger（兼容 packages setLogger 注入）。
 */
export function createLogger(module: string): Logger {
  const p = getRootPino().child({ module })
  return wrapPino(p, module)
}

/** 将 pino Logger 包装为 injectable Logger */
export function toInjectableLogger(pinoLogger: PinoLogger, module: string): Logger {
  return wrapPino(pinoLogger, module)
}

/**
 * 按级别与字段写一条日志（renderer IPC → main 用）。
 */
export function writeLogEntry(entry: {
  level: 'debug' | 'info' | 'warn' | 'error'
  module: string
  msg?: string
  bindings?: Record<string, unknown>
}): void {
  const p = getRootPino()
  const ctx = getLogContext()
  const bindings: Record<string, unknown> = {
    module: entry.module,
    ...entry.bindings
  }
  if (ctx?.sessionId) bindings.sessionId = ctx.sessionId
  if (ctx?.workspaceId) bindings.workspaceId = ctx.workspaceId
  if (ctx?.requestId) bindings.requestId = ctx.requestId

  const minLevel = levelForModule(entry.module)
  if (PINO_LEVELS[entry.level] < PINO_LEVELS[minLevel]) return

  if (entry.msg !== undefined) {
    p[entry.level](bindings, entry.msg)
  } else {
    p[entry.level](bindings)
  }
}

/** 解析 stdout JSON 行（Desktop native pipe） */
export function parseJsonLogLine(line: string): {
  level: 'debug' | 'info' | 'warn' | 'error'
  msg: string
  bindings: Record<string, unknown>
} | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('{')) return null
  try {
    const row = JSON.parse(trimmed) as Record<string, unknown>
    const levelRaw = typeof row.level === 'number' ? row.level : 30
    let level: 'debug' | 'info' | 'warn' | 'error' = 'info'
    if (levelRaw >= 50) level = 'error'
    else if (levelRaw >= 40) level = 'warn'
    else if (levelRaw >= 30) level = 'info'
    else level = 'debug'

    const msg = typeof row.msg === 'string' ? row.msg : ''
    const bindings = { ...row }
    delete bindings.level
    delete bindings.time
    delete bindings.pid
    delete bindings.hostname
    delete bindings.msg
    return { level, msg, bindings }
  } catch {
    return null
  }
}
