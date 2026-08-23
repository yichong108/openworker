import { bootstrapChannelEnv } from '@openworker/shared/load-env'
import { getNativeSqlitePath } from '@openworker/shared/path'

/**
 * 始终按 `CHANNEL` 从 shared 渠道表注入（单独启动与 Desktop spawn 同一路径）。
 * spawn 侧只需保证子进程有 `CHANNEL`。
 */
bootstrapChannelEnv({ defaultChannel: 'dev' })

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
   * 未设置时默认为 `{OPENWORKER_HOME}/native/native.sqlite`。
   */
  sqlitePath: process.env.SQLITE_PATH?.trim() || getNativeSqlitePath()
} as const
