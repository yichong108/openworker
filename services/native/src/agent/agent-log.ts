/**
 * Native 侧 agent 相关日志（与 @openworker/agent 内置 logger 独立）
 */

/**
 * 输出带 `[native:agent]` 前缀的 info 日志
 *
 * @param args - 日志参数
 */
function info(...args: unknown[]): void {
  console.info('[native:agent]', ...args)
}

/**
 * 输出带 `[native:agent]` 前缀的 warn 日志
 *
 * @param args - 日志参数
 */
function warn(...args: unknown[]): void {
  console.warn('[native:agent]', ...args)
}

/**
 * 输出带 `[native:agent]` 前缀的 error 日志
 *
 * @param args - 日志参数
 */
function error(...args: unknown[]): void {
  console.error('[native:agent]', ...args)
}

/** Native agent 日志作用域 */
export const agentLog = { info, warn, error }
