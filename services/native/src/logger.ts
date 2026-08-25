import { createLogger } from '@openworker/log'

/** Native HTTP / 生命周期 logger */
export const nativeLog = createLogger('native')

/** Native agent 运行时 logger */
export const agentLog = createLogger('native:agent')
