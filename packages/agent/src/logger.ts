/**
 * `@openworker/agent` 包内日志 — 仅供本包使用，不对外导出。
 *
 * 其他包 / 宿主应使用各自 logger（如 Desktop 的 `mainLog` / `logScope('agent')`）。
 * 前缀为包名 `[@openworker/agent]`，便于在混合输出中检索。
 */
export type AgentLogger = {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

/** 日志前缀：npm 包名，与 packages/agent/package.json 的 name 一致 */
const LOG_PREFIX = '[@openworker/agent]'

/** Agent 主流程共享 logger */
export const agentLog: AgentLogger = {
  info: (...args) => console.info(LOG_PREFIX, ...args),
  warn: (...args) => console.warn(LOG_PREFIX, ...args),
  error: (...args) => console.error(LOG_PREFIX, ...args)
}
