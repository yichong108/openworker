import { mkdirSync, writeFileSync } from 'node:fs'

import { defaultSettings, normalizeSettings, type AppSettings } from '@openworker/shared'

import { getOpenworkerDir, getOpenworkerMcpConfigPath } from '@openworker/shared/load-env'
import { getPrisma, DEFAULT_SETTINGS_ID } from '../db/prisma.js'
import { nativeLog } from '../logger.js'
import { onMcpServersChanged } from '../agent/mcp-warmup.js'

/**
 * 将 settings.mcpServers 同步写入 `{OPENWORKER_HOME}/mcp.json`
 */
function syncMcpConfigFile(settings: AppSettings): void {
  try {
    mkdirSync(getOpenworkerDir(), { recursive: true })
    const payload = { mcpServers: settings.mcpServers ?? [] }
    writeFileSync(getOpenworkerMcpConfigPath(), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  } catch (e) {
    nativeLog.warn('Failed to sync mcp.json', e instanceof Error ? e.message : e)
  }
}

/**
 * 从 SQLite TEXT JSON 列解析并规范化 AppSettings
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
 * 直读 Prisma；无行时返回默认值并落库种子。
 */
export async function getAppSettings(): Promise<AppSettings> {
  const prisma = getPrisma()
  const row = await prisma.app_settings.findUnique({
    where: { id: DEFAULT_SETTINGS_ID }
  })

  if (!row) {
    const seed = normalizeSettings({ ...defaultSettings })
    await saveAppSettings(seed)
    return seed
  }

  return parsePayload(row.payload)
}

/**
 * 用完整 AppSettings 覆盖写入全局 settings
 */
export async function saveAppSettings(settings: AppSettings): Promise<AppSettings> {
  const prisma = getPrisma()
  const next = normalizeSettings(settings)
  const now = new Date().toISOString()

  await prisma.app_settings.upsert({
    where: { id: DEFAULT_SETTINGS_ID },
    create: {
      id: DEFAULT_SETTINGS_ID,
      payload: JSON.stringify(next),
      updated_at: now
    },
    update: {
      payload: JSON.stringify(next),
      updated_at: now
    }
  })

  syncMcpConfigFile(next)
  return next
}

/**
 * 合并 patch 后保存全局 settings
 */
export async function patchAppSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getAppSettings()
  const next = await saveAppSettings({ ...current, ...patch })
  if (patch.mcpServers !== undefined) {
    void onMcpServersChanged(next.mcpServers)
  }
  return next
}
