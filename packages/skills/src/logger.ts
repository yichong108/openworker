/**
 * `@openworker/skills` 包内日志 — 可经宿主 `setLogger` 注入 pino。
 */
export type SkillsLogger = {
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

const LOG_PREFIX = '[@openworker/skills]'

function createConsoleLogger(): SkillsLogger {
  return {
    debug: (...args) => console.debug(LOG_PREFIX, ...args),
    info: (...args) => console.info(LOG_PREFIX, ...args),
    warn: (...args) => console.warn(LOG_PREFIX, ...args),
    error: (...args) => console.error(LOG_PREFIX, ...args)
  }
}

let current: SkillsLogger = createConsoleLogger()

/** 宿主注入结构化 logger（如 Native bootstrap） */
export function setLogger(logger: SkillsLogger): void {
  current = logger
}

/** Skills 加载流程共享 logger */
export const skillsLog: SkillsLogger = {
  debug: (...args) => current.debug(...args),
  info: (...args) => current.info(...args),
  warn: (...args) => current.warn(...args),
  error: (...args) => current.error(...args)
}
