import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { env } from '../config/env.js'

/** 进程内单例数据库连接 */
let db: DatabaseSync | null = null

/**
 * 获取（并按需打开）SQLite 连接
 *
 * 首次调用时创建父目录、打开库文件并启用 WAL，后续调用复用同一连接。
 * 使用 Node 内置 `node:sqlite`（DatabaseSync），避免 better-sqlite3 等原生插件的编译依赖。
 *
 * @returns DatabaseSync 实例
 * @throws 当无法创建目录或打开数据库文件时抛出底层错误
 */
export function getDb(): DatabaseSync {
  if (db) {
    return db
  }

  const sqlitePath = path.resolve(env.sqlitePath)
  mkdirSync(path.dirname(sqlitePath), { recursive: true })

  db = new DatabaseSync(sqlitePath)
  db.exec('PRAGMA journal_mode = WAL')
  return db
}

/**
 * 确保最小 schema 已就绪
 *
 * 创建 `_meta` 表作为库已初始化的标记，后续业务表可在此扩展。
 * 使用 IF NOT EXISTS，可安全在每次启动时调用。
 */
export function ensureSchema(): void {
  const database = getDb()
  database.exec(`
    CREATE TABLE IF NOT EXISTS _meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    )
  `)

  const insert = database.prepare(`INSERT OR IGNORE INTO _meta (key, value) VALUES (?, ?)`)
  insert.run('initialized_at', new Date().toISOString())
}

/**
 * 探测 SQLite 是否可读写
 *
 * 执行 `SELECT 1`；任一步失败都视为 down，供 /health 聚合使用。
 *
 * @returns 连通返回 true，否则 false
 */
export function pingSqlite(): boolean {
  try {
    const row = getDb().prepare('SELECT 1 AS ok').get() as { ok: number } | undefined
    return row?.ok === 1
  } catch {
    return false
  }
}

/**
 * 关闭进程内 SQLite 单例连接
 *
 * 供 SIGTERM/SIGINT 优雅退出使用；重复调用安全。关闭失败只记日志，避免阻塞进程退出。
 */
export function closeDb(): void {
  if (!db) return
  try {
    db.close()
  } catch (error) {
    console.error('[native] sqlite close failed', error)
  } finally {
    db = null
  }
}
