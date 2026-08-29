import { join } from 'node:path'

import { getApWebAgentsRoot } from '@/ai/agents-root'

/**
 * ap-web 项目本地日志落盘路径。
 *
 * @returns `{launchDir}/.agents/ap-config/logs/ap-web.log`
 */
export function getApWebLogPath(): string {
  return join(getApWebAgentsRoot(), 'ap-config', 'logs', 'ap-web.log')
}
