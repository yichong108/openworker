import './bootstrap-log'

import { createLogger, type Logger } from '@openworker/log'

/** ap-web 默认记录器 */
export const apWebLog = createLogger('ap-web')

/** 按 scope 划分 module，便于检索 */
export function logScope(scope: string): Logger {
  return createLogger(`ap-web:${scope}`)
}
