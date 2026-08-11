/**
 * @file OpenAI 兼容聊天模型工厂
 * @description 根据 OpenAI 协议连接参数创建 AI SDK LanguageModel
 */

import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModel } from 'ai'

/**
 * OpenAI 兼容 Chat Completions 连接参数
 *
 * 对齐常见 OpenAI SDK / `@ai-sdk/openai` 的构造入参，并附带 `model`
 *（对应 `/v1/chat/completions` 请求体中的 `model`）。
 */
export type OpenAiChatModelOptions = {
  /** API Key（Authorization: Bearer） */
  apiKey: string
  /** OpenAI 兼容 Base URL（如 `https://api.openai.com/v1`） */
  baseURL: string
  /** 模型 ID */
  model: string
}

/**
 * 获取 OpenAI 兼容聊天模型（对话 + 工具调用）。
 *
 * 未配置 API Key 时返回 null，由调用方决定抛错或降级。
 *
 * @param options - OpenAI 协议连接参数（apiKey、baseURL、model）
 * @returns AI SDK LanguageModel；未配置 API Key 时为 null
 * @throws 已配置 API Key 但未配置 Base URL 时抛出
 */
export function getChatModel(options: OpenAiChatModelOptions): LanguageModel | null {
  if (!options.apiKey?.trim()) return null
  const apiKey = options.apiKey.trim()
  const baseURL = options.baseURL?.trim()
  if (!baseURL) {
    throw new Error('请先在设置中配置接口地址（Base URL）')
  }
  const provider = createOpenAI({ apiKey, baseURL })
  return provider.chat(options.model)
}
