import type { LogLevel } from '@openworker/shared/load-env'
import pinoPretty from 'pino-pretty'

/**
 * dev 控制台 pretty stream
 */
export function createPrettyStream(_level: LogLevel): pinoPretty.PrettyStream {
  return pinoPretty({
    colorize: true,
    translateTime: 'SYS:HH:MM:ss',
    ignore: 'pid,hostname',
    messageFormat: (log, messageKey) => {
      const mod = log.module ? `[${String(log.module)}]` : ''
      const sid = log.sessionId ? ` session=${String(log.sessionId)}` : ''
      const msg = log[messageKey] ?? ''
      return `${mod}${sid} ${String(msg)}`
    }
  })
}
