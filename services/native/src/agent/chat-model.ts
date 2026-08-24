/**
 * Native 聊天模型解析 — 从 AppSettings 解析本轮 AI SDK LanguageModel
 */

import { getChatModel } from '@openworker/llm'
import { type AppSettings, getActiveProviderProfile } from '@openworker/shared'
import type { LanguageModel } from 'ai'

/**
 * 解析本轮应使用的聊天模型。
 *
 * 优先使用显式传入的 provider；未传入时从当前 provider profile 创建。
 *
 * @param settings - 应用设置（含 provider profile）
 * @param provider - 可选的 LanguageModel 覆盖
 * @returns 可用模型；均不可用时为 null
 */
export function resolveChatModel(
  settings: AppSettings,
  provider?: LanguageModel | null
): LanguageModel | null {
  if (provider) return provider
  const profile = getActiveProviderProfile(settings)
  return getChatModel({
    apiKey: profile.apiKey,
    baseURL: profile.baseUrl,
    model: profile.model
  })
}
