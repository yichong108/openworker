/**
 * `@openworker/base-agent` 包内日志 — 仅供本包使用，不对外导出。
 */
export type BaseAgentLogger = {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

/** 日志前缀：npm 包名，与 packages/base-agent/package.json 的 name 一致 */
const LOG_PREFIX = '[@openworker/base-agent]'

/** Base agent 主流程共享 logger */
export const agentLog: BaseAgentLogger = {
  info: (...args) => console.info(LOG_PREFIX, ...args),
  warn: (...args) => console.warn(LOG_PREFIX, ...args),
  error: (...args) => console.error(LOG_PREFIX, ...args)
}
