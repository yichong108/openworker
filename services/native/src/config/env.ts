import { bootstrapChannelEnv } from '@openworker/shared/load-env'

/**
 * 始终按 `CHANNEL` 从 shared 渠道表注入（单独启动与 Desktop spawn 同一路径）。
 * spawn 侧只需保证子进程有 `CHANNEL`。
 *
 * 本模块仅做副作用 bootstrap；业务侧直接读 `process.env`。
 */
bootstrapChannelEnv()

/**
 * 从 SQLITE_PATH 推导 Prisma DATABASE_URL
 *
 * Prisma SQLite datasource 需要 `file:` 前缀；Windows 盘符路径需转换分隔符。
 * 若调用方已显式设置 DATABASE_URL，则保留原值。
 */
if (!process.env.DATABASE_URL?.trim()) {
  const sqlitePath = process.env.SQLITE_PATH
  if (sqlitePath) {
    // Prisma file URL：Windows 路径分隔符 → 正斜杠
    const normalized = sqlitePath.replace(/\\/g, '/')
    process.env.DATABASE_URL = `file:${normalized}`
  }
}
