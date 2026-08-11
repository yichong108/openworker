import bcrypt from 'bcryptjs'
import { mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { env } from '../config/env.js'

/** 进程内单例数据库连接 */
let db: DatabaseSync | null = null

/** 默认管理员账号（仅在 users 表无该用户时写入） */
const DEFAULT_ADMIN_USERNAME = 'admin'
/** 默认管理员明文密码；生产环境应尽快修改 */
const DEFAULT_ADMIN_PASSWORD = 'admin'
/** bcrypt 计算成本 */
const BCRYPT_ROUNDS = 10

/**
 * 获取（并按需打开）SQLite 连接
 *
 * 首次调用时创建父目录、打开库文件并启用 WAL 与外键约束，后续调用复用同一连接。
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
  db.exec('PRAGMA foreign_keys = ON')
  return db
}

/**
 * 确保业务 schema 已就绪，并写入默认管理员账号
 *
 * 创建 `_meta` 与业务表（users / app_settings / workspaces / sessions / user_profiles）。
 * 使用 IF NOT EXISTS / 按用户名查重，可安全在每次启动时调用。
 * JSON 字段以 TEXT 存储；时间戳由业务层显式写入 ISO 字符串。
 */
export function ensureSchema(): void {
  const database = getDb()

  database.exec(`
    CREATE TABLE IF NOT EXISTS _meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    )
  `)

  database
    .prepare(`INSERT OR IGNORE INTO _meta (key, value) VALUES (?, ?)`)
    .run('initialized_at', new Date().toISOString())

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  database.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // 复合主键 (user_id, id)：允许每用户共用固定 id（如 workspace-home）
  database.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      user_id TEXT NOT NULL,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      path TEXT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT NULL DEFAULT NULL,
      PRIMARY KEY (user_id, id),
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `)

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_workspaces_user_sort
      ON workspaces (user_id, sort_order)
  `)
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_workspaces_user_deleted
      ON workspaces (user_id, deleted_at)
  `)

  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      user_id TEXT NOT NULL,
      id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      messages_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT NULL DEFAULT NULL,
      PRIMARY KEY (user_id, id),
      FOREIGN KEY (user_id) REFERENCES users (id),
      FOREIGN KEY (user_id, workspace_id) REFERENCES workspaces (user_id, id)
    )
  `)

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_user_ws_updated
      ON sessions (user_id, workspace_id, updated_at)
  `)
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_ws_deleted
      ON sessions (user_id, workspace_id, deleted_at)
  `)

  database.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id TEXT PRIMARY KEY NOT NULL,
      facts_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `)

  seedDefaultAdmin()
}

/**
 * 若不存在 admin 用户，则插入默认管理员（账号/密码均为 admin）
 *
 * 使用查重后再插入，避免重复启动时覆盖已修改的密码。
 */
function seedDefaultAdmin(): void {
  const database = getDb()
  const existing = database
    .prepare('SELECT id FROM users WHERE username = ? LIMIT 1')
    .get(DEFAULT_ADMIN_USERNAME) as { id: string } | undefined
  if (existing) return

  const passwordHash = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, BCRYPT_ROUNDS)
  database
    .prepare(
      `INSERT INTO users (id, username, password_hash, role, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(randomUUID(), DEFAULT_ADMIN_USERNAME, passwordHash, 'admin', new Date().toISOString())
  console.log(
    `[native] seeded default admin user: ${DEFAULT_ADMIN_USERNAME} / ${DEFAULT_ADMIN_PASSWORD}`
  )
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
