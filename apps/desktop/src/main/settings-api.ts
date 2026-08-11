import { type AppSettings, normalizeSettings } from '@openworker/shared'

import { mainLog } from '@/main/logger'
import { getNativeBaseUrl } from '@/main/native-service'

/** Settings API 响应体 */
type SettingsApiResponse = {
  data: AppSettings
}

/**
 * 从 Native 服务拉取全局 AppSettings
 *
 * @returns 规范化后的 AppSettings
 * @throws 当 HTTP 非 2xx 或响应结构非法时抛出
 */
export async function fetchSettingsFromApi(): Promise<AppSettings> {
  const url = `${getNativeBaseUrl()}/settings`
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GET /settings failed: ${res.status} ${text}`)
  }
  const body = (await res.json()) as SettingsApiResponse
  if (!body || typeof body !== 'object' || body.data == null) {
    throw new Error('GET /settings: invalid response body')
  }
  return normalizeSettings(body.data)
}

/**
 * 将 partial settings 推送到 Native 服务并返回合并后的完整配置
 *
 * @param patch - 要合并的字段
 * @returns Native 返回并规范化后的 AppSettings
 * @throws 当 HTTP 非 2xx 或响应结构非法时抛出
 */
export async function putSettingsToApi(patch: Partial<AppSettings>): Promise<AppSettings> {
  const url = `${getNativeBaseUrl()}/settings`
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(patch)
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`PUT /settings failed: ${res.status} ${text}`)
  }
  const body = (await res.json()) as SettingsApiResponse
  if (!body || typeof body !== 'object' || body.data == null) {
    throw new Error('PUT /settings: invalid response body')
  }
  return normalizeSettings(body.data)
}

/**
 * 记录 settings API 调用失败（不抛出），便于主进程排查
 *
 * @param action - 操作名
 * @param error - 错误对象
 */
export function logSettingsApiError(action: string, error: unknown): void {
  mainLog.warn(
    `[settings-api] ${action} failed:`,
    error instanceof Error ? error.message : String(error)
  )
}
