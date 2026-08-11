import type { AuthUserListItem } from '@openworker/shared'

import { getDb } from '../db/sqlite.js'

type UserListRow = {
  id: string
  username: string
  role: string
  created_at: string
}

/**
 * 将数据库时间字段规范为 ISO 8601 字符串
 *
 * @param value - created_at 原始值
 * @returns ISO 8601 时间字符串
 */
function toIsoString(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString()
}

/**
 * 查询全部用户列表（不含密码）
 *
 * 按创建时间降序返回，供后台管理用户列表页展示。
 *
 * @returns 用户公开信息列表
 */
export async function listUsers(): Promise<AuthUserListItem[]> {
  const rows = getDb()
    .prepare(
      `SELECT id, username, role, created_at
       FROM users
       ORDER BY created_at DESC`
    )
    .all() as UserListRow[]

  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    role: row.role,
    createdAt: toIsoString(row.created_at)
  }))
}
