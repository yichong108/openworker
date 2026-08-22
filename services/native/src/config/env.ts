import path from 'node:path'
import { config as loadEnv } from 'dotenv'

import { getOpenworkerDir } from '../agent/paths.js'

loadEnv()

/**
 * 解析 SQLite 默认路径：`{OPENWORKER_HOME}/native/native.sqlite`
 *
 * 与 skills / mcp 共用数据根，便于 Desktop / CLI 与独立进程读写同一份库。
 *
 * @returns 绝对路径形式的默认数据库文件路径
 */
function defaultSqlitePath(): string {
  return path.join(getOpenworkerDir(), 'native', 'native.sqlite')
}

/**
 * Native 服务运行时配置
 *
 * 从环境变量读取监听端口与 SQLite 文件路径。
 * 集中配置避免业务代码直接读 process.env，并保证未设置 SQLITE_PATH 时落到用户主目录约定路径。
 */
export const env = {
  /** HTTP 服务监听端口 */
  port: Number(process.env.PORT ?? process.env.OPENWORKER_NATIVE_PORT ?? 3200),

  /**
   * SQLite 数据库文件绝对或相对路径。
   * 未设置时默认为 `{OPENWORKER_HOME}/native/native.sqlite`（无 OPENWORKER_HOME 时为 `~/.openworker/...`）。
   */
  sqlitePath: process.env.SQLITE_PATH?.trim() || defaultSqlitePath()
} as const
