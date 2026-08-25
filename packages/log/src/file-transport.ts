import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import pino from 'pino'

/**
 * 创建 append 文件 destination；确保目录存在。
 *
 * @param filePath - 绝对路径
 */
export function createFileDestination(filePath: string): pino.DestinationStream {
  mkdirSync(dirname(filePath), { recursive: true })
  return pino.destination({ dest: filePath, append: true, mkdir: true, sync: false })
}
