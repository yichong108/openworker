import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import '../config/env.js'

/** 进程内单例数据库连接 */
let db: DatabaseSync | null = null

/** 当前单租户 schema 版本（写入 `_meta.schema_version`） */
const SCHEMA_VERSION = '2'

/** 本机画像单行主键（对齐 app_settings） */
export const LOCAL_PROFILE_ID = 'default'

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

  const sqlitePath = path.resolve(process.env.SQLITE_PATH!)
  mkdirSync(path.dirname(sqlitePath), { recursive: true })

  db = new DatabaseSync(sqlitePath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  return db
}

/**
 * 判断表是否存在。
 *
 * @param database - SQLite 连接
 * @param tableName - 表名
 */
function tableExists(database: DatabaseSync, tableName: string): boolean {
  const row = database
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`)
    .get(tableName) as { name: string } | undefined
  return Boolean(row?.name)
}

/**
 * 读取 `_meta.schema_version`。
 *
 * @param database - SQLite 连接
 * @returns 版本字符串；未写入时返回 null
 */
function getSchemaVersion(database: DatabaseSync): string | null {
  if (!tableExists(database, '_meta')) return null
  const row = database
    .prepare(`SELECT value FROM _meta WHERE key = ? LIMIT 1`)
    .get('schema_version') as { value: string } | undefined
  return row?.value ?? null
}

/**
 * 写入 `_meta.schema_version`。
 *
 * @param database - SQLite 连接
 * @param version - 版本字符串
 */
function setSchemaVersion(database: DatabaseSync, version: string): void {
  database
    .prepare(
      `INSERT INTO _meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run('schema_version', version)
}

/**
 * 从旧多用户库中选定迁移源用户：优先 admin，否则最早创建的用户。
 *
 * @param database - SQLite 连接
 * @returns 源 user_id；无用户时返回 null
 */
function resolveMigrationSourceUserId(database: DatabaseSync): string | null {
  if (!tableExists(database, 'users')) return null
  const admin = database.prepare(`SELECT id FROM users WHERE username = ? LIMIT 1`).get('admin') as
    | { id: string }
    | undefined
  if (admin?.id) return admin.id
  const first = database.prepare(`SELECT id FROM users ORDER BY created_at ASC LIMIT 1`).get() as
    | { id: string }
    | undefined
  return first?.id ?? null
}

/**
 * 将旧多用户表迁移为本机单租户表（schema v2）。
 *
 * 拷贝选定用户的 workspaces / sessions / profile，再删除旧表。
 *
 * @param database - SQLite 连接
 */
function migrateFromMultiUserSchema(database: DatabaseSync): void {
  const sourceUserId = resolveMigrationSourceUserId(database)
  console.log(
    `[native] migrating sqlite to schema v${SCHEMA_VERSION}` +
      (sourceUserId ? ` (source user_id=${sourceUserId})` : ' (no source user)')
  )

  database.exec('PRAGMA foreign_keys = OFF')
  database.exec('BEGIN')
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS workspaces_v2 (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        path TEXT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT NULL DEFAULT NULL
      )
    `)
    database.exec(`
      CREATE TABLE IF NOT EXISTS sessions_v2 (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        messages_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT NULL DEFAULT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces_v2 (id)
      )
    `)
    database.exec(`
      CREATE TABLE IF NOT EXISTS user_profiles_v2 (
        id TEXT PRIMARY KEY NOT NULL,
        facts_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    if (sourceUserId && tableExists(database, 'workspaces')) {
      database
        .prepare(
          `INSERT OR IGNORE INTO workspaces_v2
             (id, name, path, sort_order, is_default, created_at, updated_at, deleted_at)
           SELECT id, name, path, sort_order, is_default, created_at, updated_at, deleted_at
           FROM workspaces
           WHERE user_id = ?`
        )
        .run(sourceUserId)
    }

    if (sourceUserId && tableExists(database, 'sessions')) {
      database
        .prepare(
          `INSERT OR IGNORE INTO sessions_v2
             (id, workspace_id, name, messages_json, created_at, updated_at, deleted_at)
           SELECT id, workspace_id, name, messages_json, created_at, updated_at, deleted_at
           FROM sessions
           WHERE user_id = ?`
        )
        .run(sourceUserId)
    }

    if (sourceUserId && tableExists(database, 'user_profiles')) {
      database
        .prepare(
          `INSERT OR IGNORE INTO user_profiles_v2 (id, facts_json, updated_at)
           SELECT ?, facts_json, updated_at
           FROM user_profiles
           WHERE user_id = ?
           LIMIT 1`
        )
        .run(LOCAL_PROFILE_ID, sourceUserId)
    }

    if (tableExists(database, 'sessions')) {
      database.exec(`DROP TABLE sessions`)
    }
    if (tableExists(database, 'workspaces')) {
      database.exec(`DROP TABLE workspaces`)
    }
    if (tableExists(database, 'user_profiles')) {
      database.exec(`DROP TABLE user_profiles`)
    }
    if (tableExists(database, 'users')) {
      database.exec(`DROP TABLE users`)
    }

    database.exec(`ALTER TABLE workspaces_v2 RENAME TO workspaces`)
    database.exec(`ALTER TABLE sessions_v2 RENAME TO sessions`)
    database.exec(`ALTER TABLE user_profiles_v2 RENAME TO user_profiles`)

    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_workspaces_sort
        ON workspaces (sort_order)
    `)
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_workspaces_deleted
        ON workspaces (deleted_at)
    `)
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_ws_updated
        ON sessions (workspace_id, updated_at)
    `)
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_ws_deleted
        ON sessions (workspace_id, deleted_at)
    `)

    setSchemaVersion(database, SCHEMA_VERSION)
    database.exec('COMMIT')
    console.log(`[native] sqlite migration to schema v${SCHEMA_VERSION} complete`)
  } catch (error) {
    database.exec('ROLLBACK')
    console.error('[native] sqlite migration failed', error)
    throw error
  } finally {
    database.exec('PRAGMA foreign_keys = ON')
  }
}

/**
 * 创建单租户业务表（幂等）。
 *
 * @param database - SQLite 连接
 */
function createSingleTenantTables(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  database.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      path TEXT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT NULL DEFAULT NULL
    )
  `)

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_workspaces_sort
      ON workspaces (sort_order)
  `)
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_workspaces_deleted
      ON workspaces (deleted_at)
  `)

  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      messages_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT NULL DEFAULT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces (id)
    )
  `)

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_ws_updated
      ON sessions (workspace_id, updated_at)
  `)
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_ws_deleted
      ON sessions (workspace_id, deleted_at)
  `)

  database.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      id TEXT PRIMARY KEY NOT NULL,
      facts_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
}

/**
 * 确保业务 schema 已就绪（本机单租户 schema v2）
 *
 * 创建 `_meta` 与业务表（app_settings / workspaces / sessions / user_profiles）。
 * 若检测到旧多用户表（含 `users` 或 schema_version 非 2），则迁移选定用户数据后切换。
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

  const version = getSchemaVersion(database)
  const needsMigration =
    version !== SCHEMA_VERSION &&
    (tableExists(database, 'users') ||
      (tableExists(database, 'workspaces') && version !== SCHEMA_VERSION))

  if (needsMigration && tableExists(database, 'users')) {
    migrateFromMultiUserSchema(database)
    createSingleTenantTables(database)
    setSchemaVersion(database, SCHEMA_VERSION)
    return
  }

  // 已是 v2，或全新空库：确保表存在
  if (tableExists(database, 'workspaces')) {
    // 防御：若 workspaces 仍含 user_id 列且无 users（异常半迁移），要求重建
    const cols = database.prepare(`PRAGMA table_info(workspaces)`).all() as Array<{
      name: string
    }>
    if (cols.some((c) => c.name === 'user_id')) {
      throw new Error(
        '[native] legacy workspaces.user_id detected without users table; delete native.sqlite and restart'
      )
    }
  }

  createSingleTenantTables(database)
  setSchemaVersion(database, SCHEMA_VERSION)
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
