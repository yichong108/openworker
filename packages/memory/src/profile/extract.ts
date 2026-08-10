/**
 * 从对话消息中用 LLM 抽取用户画像事实（纯函数 + 注入 Summarizer）
 */

import type { Message } from '@ag-ui/client'

import { messageContentToText, truncateChars } from '../budget.js'
import { normalizeUserFact } from './merge.js'
import type { Summarizer, UserFact, UserProfile } from '../types.js'

/** 送入抽取提示的对话文本预算 */
const EXTRACT_DIALOG_CHARS = 6_000

/**
 * 将 AG-UI 消息压成短对话文本（供抽取提示）。
 *
 * @param messages - 消息列表
 * @param maxChars - 最大字符
 */
function messagesToDialogText(messages: Message[], maxChars: number): string {
  const lines: string[] = []
  for (const message of messages) {
    if (message.role !== 'user' && message.role !== 'assistant') continue
    const text = messageContentToText(message.content).trim().replace(/\s+/g, ' ')
    if (!text) continue
    const { text: snippet } = truncateChars(text, 400)
    lines.push(`${message.role}: ${snippet}`)
  }
  return truncateChars(lines.join('\n'), maxChars).text
}

/**
 * 从模型输出中解析 JSON 事实数组。
 *
 * @param raw - 模型原文
 * @param now - 时间戳
 * @returns 规范化后的事实；解析失败返回 []
 */
export function parseExtractedFactsJson(raw: string, now: number = Date.now()): UserFact[] {
  const trimmed = raw.trim()
  if (!trimmed) return []

  let jsonText = trimmed
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    jsonText = fenced[1].trim()
  } else {
    const start = trimmed.indexOf('[')
    const end = trimmed.lastIndexOf(']')
    if (start >= 0 && end > start) {
      jsonText = trimmed.slice(start, end + 1)
    }
  }

  try {
    const parsed: unknown = JSON.parse(jsonText)
    if (!Array.isArray(parsed)) return []
    const out: UserFact[] = []
    for (const item of parsed) {
      const fact = normalizeUserFact(
        {
          ...(typeof item === 'object' && item != null ? item : {}),
          source: 'llm'
        },
        now
      )
      if (fact) out.push({ ...fact, source: 'llm' })
    }
    return out
  } catch {
    return []
  }
}

/**
 * 使用宿主 Summarizer 从消息中抽取跨会话用户事实。
 *
 * 失败（网络/解析）返回空数组，不抛出。
 *
 * @param input.messages - 近期 AG-UI 消息
 * @param input.prior - 可选已有画像（写入提示避免重复）
 * @param input.summarizer - 宿主注入的摘要器
 * @returns 新抽取的 UserFact[]
 */
export async function extractProfileFacts(input: {
  messages: Message[]
  prior?: UserProfile | null
  summarizer: Summarizer
}): Promise<UserFact[]> {
  const dialog = messagesToDialogText(input.messages ?? [], EXTRACT_DIALOG_CHARS)
  if (!dialog.trim()) return []

  const priorLines = (input.prior?.facts ?? [])
    .slice(0, 24)
    .map((f) => `- ${f.key}: ${f.value}`)
    .join('\n')

  const prompt = [
    'Extract durable cross-session user profile facts from the dialog.',
    'Only stable preferences, identity, project conventions, or workflow habits.',
    'Do NOT extract ephemeral task details, one-off file paths, or temporary errors.',
    'Keys MUST use namespaces: preference.*, identity.*, project.*, workflow.*',
    'Return a JSON array ONLY, no markdown, shape:',
    '[{"key":"preference.packageManager","value":"pnpm","confidence":0.9}]',
    'If nothing durable, return [].',
    priorLines ? `\nExisting facts (avoid duplicates unless updating):\n${priorLines}` : '',
    '',
    '--- Dialog ---',
    dialog
  ]
    .filter((line) => line !== '')
    .join('\n')

  try {
    const raw = await input.summarizer.summarize({ prompt, maxChars: 2_000 })
    return parseExtractedFactsJson(raw)
  } catch {
    return []
  }
}
