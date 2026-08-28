type LogLevel = 'debug' | 'info' | 'warn' | 'error'

import type { OpenworkerApi } from '@/preload/index'

declare global {
  interface Window {
    bridge: OpenworkerApi
  }
}

function normalizeArgs(args: unknown[]): {
  msg?: string
  bindings?: Record<string, unknown>
} {
  if (args.length === 0) return {}
  const [first, ...rest] = args
  if (typeof first === 'string') {
    if (
      rest.length === 1 &&
      rest[0] !== null &&
      typeof rest[0] === 'object' &&
      !Array.isArray(rest[0])
    ) {
      return { msg: first, bindings: rest[0] as Record<string, unknown> }
    }
    return { msg: [first, ...rest].map(String).join(' ') }
  }
  if (first !== null && typeof first === 'object' && !Array.isArray(first)) {
    return {
      bindings: first as Record<string, unknown>,
      msg: rest.length > 0 ? rest.map(String).join(' ') : undefined
    }
  }
  return { msg: args.map(String).join(' ') }
}

function emit(level: LogLevel, module: string, args: unknown[]): void {
  const { msg, bindings } = normalizeArgs(args)
  try {
    window.bridge.logWrite({ level, module, msg, bindings })
  } catch {
    // preload 未就绪时忽略
  }
  const consoleFn = level === 'debug' ? console.debug : console[level]
  consoleFn(`[${module}]`, ...args)
}

function createRendererLogger(module: string) {
  return {
    debug: (...args: unknown[]) => emit('debug', module, args),
    info: (...args: unknown[]) => emit('info', module, args),
    warn: (...args: unknown[]) => emit('warn', module, args),
    error: (...args: unknown[]) => emit('error', module, args)
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    emit('error', 'desktop:renderer', [event.message, event.error])
  })
  window.addEventListener('unhandledrejection', (event) => {
    emit('error', 'desktop:renderer', ['unhandledrejection', event.reason])
  })
}

/** 渲染进程记录器（IPC → 主进程 openworker.log） */
export const renderLog = createRendererLogger('desktop:renderer')

export function logScope(scope: string) {
  return createRendererLogger(`desktop:${scope}`)
}
