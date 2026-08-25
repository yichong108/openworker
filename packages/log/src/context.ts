import { AsyncLocalStorage } from 'node:async_hooks'

import type { LogContext } from './types.js'

const storage = new AsyncLocalStorage<LogContext>()

/**
 * 在 ALS 上下文中执行（Express 请求 / agent run 等）。
 */
export function runWithLogContext<T>(ctx: LogContext, fn: () => T): T {
  const parent = storage.getStore()
  return storage.run({ ...parent, ...ctx }, fn)
}

/**
 * 在 ALS 上下文中执行异步函数。
 */
export async function runWithLogContextAsync<T>(ctx: LogContext, fn: () => Promise<T>): Promise<T> {
  const parent = storage.getStore()
  return storage.run({ ...parent, ...ctx }, fn)
}

/** 读取当前 ALS 日志上下文 */
export function getLogContext(): LogContext | undefined {
  return storage.getStore()
}
