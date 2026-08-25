import { Cursor } from '@cursor/sdk'

import {
  type AiProvider,
  defaultCursorModel,
  defaultDeepseekModel,
  readAiConfig
} from './ai-config'
import { loadCursorEnv } from './load-env'

/**
 * 从未知的模型列表响应里抽出 id。
 *
 * @param payload - SDK 或 HTTP JSON
 * @returns 模型 id 列表
 */
function extractModelIds(payload: unknown): string[] {
  if (typeof payload === 'string' && payload.trim()) return [payload.trim()]
  if (Array.isArray(payload)) {
    const ids: string[] = []
    for (const item of payload) {
      if (typeof item === 'string' && item.trim()) ids.push(item.trim())
      else if (item && typeof item === 'object' && 'id' in item) {
        const id = (item as { id: unknown }).id
        if (typeof id === 'string' && id.trim()) ids.push(id.trim())
      }
    }
    return ids
  }
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>
    if (Array.isArray(obj.models)) return extractModelIds(obj.models)
    if (Array.isArray(obj.data)) return extractModelIds(obj.data)
    if (Array.isArray(obj.items)) return extractModelIds(obj.items)
  }
  return []
}

/**
 * 保证默认模型出现在列表第一项。
 *
 * @param ids - 已获取的 id
 * @param fallback - 默认 id
 * @returns 去重后的列表
 */
function withFallback(ids: string[], fallback: string): string[] {
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.includes(fallback)) unique.unshift(fallback)
  return unique
}

/**
 * 拉取 Cursor 模型列表；失败则只返回默认模型。
 *
 * @param apiKey - 可选覆盖密钥
 * @returns 模型 id 与可选鉴权错误
 */
export async function listCursorModels(
  apiKey?: string
): Promise<{ models: string[]; authError?: string }> {
  loadCursorEnv()
  const key =
    apiKey?.trim() || readAiConfig().cursor.apiKey.trim() || process.env.CURSOR_API_KEY?.trim()
  try {
    const payload = await Cursor.models.list(key ? { apiKey: key } : {})
    const models = withFallback(extractModelIds(payload), defaultCursorModel())
    return { models }
  } catch (error) {
    const message = error instanceof Error ? error.message : '无法获取 Cursor 模型列表'
    return { models: [defaultCursorModel()], authError: message }
  }
}

/**
 * 拉取 DeepSeek 模型列表；失败则只返回默认模型。
 *
 * @param apiKey - 可选覆盖密钥
 * @returns 模型 id 与可选鉴权错误
 */
export async function listDeepseekModels(
  apiKey?: string
): Promise<{ models: string[]; authError?: string }> {
  const key =
    apiKey?.trim() || readAiConfig().deepseek.apiKey.trim() || process.env.DEEPSEEK_API_KEY?.trim()
  if (!key) {
    return { models: [defaultDeepseekModel()], authError: '未填写 DeepSeek API Key' }
  }
  try {
    const response = await fetch('https://api.deepseek.com/models', {
      headers: { Authorization: `Bearer ${key}` }
    })
    const payload: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      const detail =
        payload && typeof payload === 'object' && 'error' in payload
          ? JSON.stringify((payload as { error: unknown }).error)
          : `HTTP ${response.status}`
      return { models: [defaultDeepseekModel()], authError: `DeepSeek 鉴权失败：${detail}` }
    }
    const models = withFallback(extractModelIds(payload), defaultDeepseekModel())
    return { models }
  } catch (error) {
    const message = error instanceof Error ? error.message : '无法获取 DeepSeek 模型列表'
    return { models: [defaultDeepseekModel()], authError: message }
  }
}

/**
 * 按提供方拉取模型列表。
 *
 * @param provider - cursor 或 deepseek
 * @param apiKey - 可选覆盖密钥
 * @returns 模型 id 与可选鉴权错误
 */
export async function listAiModels(
  provider: AiProvider,
  apiKey?: string
): Promise<{ models: string[]; authError?: string }> {
  if (provider === 'deepseek') return listDeepseekModels(apiKey)
  return listCursorModels(apiKey)
}
