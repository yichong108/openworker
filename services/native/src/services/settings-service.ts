import { mkdirSync, writeFileSync } from 'node:fs'

import { defaultSettings, normalizeSettings, type AppSettings } from '@openworker/shared'

import { getOpenworkerDir, getOpenworkerMcpConfigPath } from '../agent/paths.js'
import { onMcpServersChanged } from '../agent/mcp-warmup.js'
import { getDb } from '../db/sqlite.js'

/**
 * 将 settings.mcpServers 同步写入 ~/.openworker/mcp.json
 *
 * @param settings - 当前应用设置
 */
function syncMcpConfigFile(settings: AppSettings): void {
  try {
    mkdirSync(getOpenworkerDir(), { recursive: true })
    const payload = { mcpServers: settings.mcpServers ?? [] }
    writeFileSync(getOpenworkerMcpConfigPath(), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  } catch (e) {
    console.warn('[native] Failed to sync mcp.json:', e instanceof Error ? e.message : e)
  }
}

/** 全局单例 settings 行主键（多用户 auth 落地前使用） */
export const DEFAULT_SETTINGS_ID = 'default'

type SettingsRow = {
  payload: string
}

/**
 * 从 SQLite TEXT JSON 列解析并规范化 AppSettings
 *
 * @param payload - JSON 字符串
 * @returns 规范化后的 AppSettings
 */
function parsePayload(payload: string | null | undefined): AppSettings {
  if (payload == null) return normalizeSettings({})
  try {
    return normalizeSettings(JSON.parse(payload) as Partial<AppSettings>)
  } catch {
    return normalizeSettings({})
  }
}

/**
 * 读取全局应用 settings
 *
 * 直读 SQLite（无 Redis 缓存）；无行时返回默认值并落库种子。
 *
 * @returns 规范化后的 AppSettings
 */
export async function getAppSettings(): Promise<AppSettings> {
  const row = getDb()
    .prepare('SELECT payload FROM app_settings WHERE id = ? LIMIT 1')
    .get(DEFAULT_SETTINGS_ID) as SettingsRow | undefined

  if (!row) {
    const seed = normalizeSettings({ ...defaultSettings })
    await saveAppSettings(seed)
    return seed
  }

  return parsePayload(row.payload)
}

/**
 * 用完整 AppSettings 覆盖写入全局 settings
 *
 * @param settings - 已规范化的完整 settings
 * @returns 写入后的 AppSettings
 */
export async function saveAppSettings(settings: AppSettings): Promise<AppSettings> {
  const next = normalizeSettings(settings)
  const now = new Date().toISOString()
  getDb()
    .prepare(
      `INSERT INTO app_settings (id, payload, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         payload = excluded.payload,
         updated_at = excluded.updated_at`
    )
    .run(DEFAULT_SETTINGS_ID, JSON.stringify(next), now)
  syncMcpConfigFile(next)
  return next
}

/**
 * 合并 patch 后保存全局 settings
 *
 * @param patch - 部分 AppSettings 字段
 * @returns 合并并规范化后的完整 AppSettings
 */
export async function patchAppSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getAppSettings()
  const next = await saveAppSettings({ ...current, ...patch })
  if (patch.mcpServers !== undefined) {
    void onMcpServersChanged(next.mcpServers)
  }
  return next
}
