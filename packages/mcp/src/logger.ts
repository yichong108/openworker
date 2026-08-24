/**
 * `@openworker/mcp` 包内日志 — 仅供本包使用，不对外导出。
 *
 * 前缀为包名 `[@openworker/mcp]`，便于在混合输出中检索。
 */
export type McpLogger = {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

/** 日志前缀：npm 包名，与 packages/mcp/package.json 的 name 一致 */
const LOG_PREFIX = '[@openworker/mcp]'

/** MCP 连接池与工具绑定共享 logger */
export const mcpLog: McpLogger = {
  info: (...args) => console.info(LOG_PREFIX, ...args),
  warn: (...args) => console.warn(LOG_PREFIX, ...args),
  error: (...args) => console.error(LOG_PREFIX, ...args)
}
