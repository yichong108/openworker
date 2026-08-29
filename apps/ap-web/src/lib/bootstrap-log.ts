import { createLogger, initRootLogger } from '@openworker/log'
import { setLogger as setBaseAgentLogger } from '@openworker/base-agent/logger'
import { setLogger as setToolsLogger } from '@openworker/tools/logger'

import { getApWebLaunchDir } from '@/ai/agents-root'
import { loadApEnv } from '@/ai/load-env'

import { getApWebLogPath } from './log-path'

let initialized = false

/**
 * 初始化 ap-web 根 logger 并向 agent 链注入 pino child。
 * 由 instrumentation.ts 在 Node 运行时 import 一次。
 */
export function bootstrapApWebLogging(): void {
  if (initialized) return
  initialized = true

  loadApEnv()
  const logPath = getApWebLogPath()
  initRootLogger({
    console: true,
    file: logPath,
    stdoutJson: false
  })

  setBaseAgentLogger(createLogger('@openworker/base-agent'))
  setToolsLogger(createLogger('@openworker/tools'))

  const boot = createLogger('ap-web')
  process.on('uncaughtException', (error) => {
    boot.error('uncaughtException', error)
  })
  process.on('unhandledRejection', (reason) => {
    boot.error('unhandledRejection', reason)
  })
  boot.info({ logPath, launchDir: getApWebLaunchDir() }, 'ap-web logger ready')
}

bootstrapApWebLogging()
