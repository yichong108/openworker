/**
 * `@openworker/base-agent` 包内日志 — 可经宿主 `setLogger` 注入 pino。
 */
export type BaseAgentLogger = {
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

const LOG_PREFIX = '[@openworker/base-agent]'

function createConsoleLogger(): BaseAgentLogger {
  return {
    debug: (...args) => console.debug(LOG_PREFIX, ...args),
    info: (...args) => console.info(LOG_PREFIX, ...args),
    warn: (...args) => console.warn(LOG_PREFIX, ...args),
    error: (...args) => console.error(LOG_PREFIX, ...args)
  }
}

let current: BaseAgentLogger = createConsoleLogger()

/** 宿主注入结构化 logger */
export function setLogger(logger: BaseAgentLogger): void {
  current = logger
}

/** Base agent 主流程共享 logger */
export const agentLog: BaseAgentLogger = {
  debug: (...args) => current.debug(...args),
  info: (...args) => current.info(...args),
  warn: (...args) => current.warn(...args),
  error: (...args) => current.error(...args)
}
