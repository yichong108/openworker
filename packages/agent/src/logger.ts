/**
 * `@openworker/agent` 包内日志 — 仅供本包使用，不对外导出。
 */
export type AgentLogger = {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

const LOG_PREFIX = '[@openworker/agent]'

/** Agent 主流程共享 logger */
export const agentLog: AgentLogger = {
  info: (...args) => console.info(LOG_PREFIX, ...args),
  warn: (...args) => console.warn(LOG_PREFIX, ...args),
  error: (...args) => console.error(LOG_PREFIX, ...args)
}
