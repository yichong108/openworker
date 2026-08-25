import { createLogger, initRootLogger } from '@openworker/log'
import { getOpenworkerLogPath, isNativePipeLogsMode } from '@openworker/shared/load-env'
import { setLogger as setBaseAgentLogger } from '@openworker/base-agent/logger'
import { setLogger as setMcpLogger } from '@openworker/mcp/logger'
import { setLogger as setSkillsLogger } from '@openworker/skills/logger'
import { setLogger as setToolsLogger } from '@openworker/tools/logger'

import { nativeLog } from './logger.js'

/**
 * 初始化 Native 根 logger 并向各 package 注入 pino child。
 * 须在 `bootstrapChannelEnv()` 之后调用。
 */
export function bootstrapNativeLogging(): void {
  const pipeMode = isNativePipeLogsMode()

  initRootLogger(
    pipeMode
      ? { stdoutJson: true, console: false, file: null }
      : { console: true, file: getOpenworkerLogPath(), stdoutJson: false }
  )

  setSkillsLogger(createLogger('@openworker/skills'))
  setToolsLogger(createLogger('@openworker/tools'))
  setBaseAgentLogger(createLogger('@openworker/base-agent'))
  setMcpLogger(createLogger('@openworker/mcp'))

  if (pipeMode) {
    nativeLog.info('native logger ready (pipe mode → stdout JSON)')
  } else {
    nativeLog.info({ logPath: getOpenworkerLogPath() }, 'native logger ready')
  }
}
