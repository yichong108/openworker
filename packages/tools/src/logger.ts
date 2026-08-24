/**
 * `@openworker/tools` 包内日志 — 仅供本包使用，不对外导出。
 *
 * 前缀为包名 `[@openworker/tools]`，便于在混合输出中检索。
 */
export type ToolsLogger = {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

/** 日志前缀：npm 包名，与 packages/tools/package.json 的 name 一致 */
const LOG_PREFIX = '[@openworker/tools]'

/** Skills 加载流程共享 logger */
export const toolsLog: ToolsLogger = {
  info: (...args) => console.info(LOG_PREFIX, ...args),
  warn: (...args) => console.warn(LOG_PREFIX, ...args),
  error: (...args) => console.error(LOG_PREFIX, ...args)
}
