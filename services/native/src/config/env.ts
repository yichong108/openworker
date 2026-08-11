import { homedir } from 'node:os'
import path from 'node:path'
import { config as loadEnv } from 'dotenv'

loadEnv()

/**
 * 解析 SQLite 默认路径：~/.openworker/native/native.sqlite
 *
 * 与 skills / mcp 共用 ~/.openworker 根目录，便于 Desktop / CLI 与独立进程读写同一份库。
 *
 * @returns 绝对路径形式的默认数据库文件路径
 */
function defaultSqlitePath(): string {
  return path.join(homedir(), '.openworker', 'native', 'native.sqlite')
}

/**
 * Native 服务运行时配置
 *
 * 从环境变量读取监听端口与 SQLite 文件路径。
 * 集中配置避免业务代码直接读 process.env，并保证未设置 SQLITE_PATH 时落到用户主目录约定路径。
 */
export const env = {
  /** HTTP 服务监听端口 */
  port: Number(process.env.PORT ?? 3200),

  /**
   * SQLite 数据库文件绝对或相对路径。
   * 未设置时默认为 ~/.openworker/native/native.sqlite。
   */
  sqlitePath: process.env.SQLITE_PATH?.trim() || defaultSqlitePath(),

  /**
   * JWT 签名密钥；生产环境务必通过 JWT_SECRET 覆盖
   */
  jwtSecret: process.env.JWT_SECRET ?? 'openworker-dev-jwt-secret-change-me',

  /** access token 有效期（如 `7d`、`12h`） */
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d'
} as const
