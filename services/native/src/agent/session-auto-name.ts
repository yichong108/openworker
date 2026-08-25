/**
 * 会话自动命名：根据用户首条消息，经 uni-agent `ask`（ask 模式、单步）生成短标题并重命名。
 */

import { ask } from '@openworker/uni-agent'

import { resolveChatModel } from './chat-model.js'
import { agentLog } from '../logger.js'
import { getAppSettings } from '../services/settings-service.js'
import { getSession, patchSession } from '../services/session-service.js'

/** 侧栏展示用临时名最大长度 */
const PROVISIONAL_NAME_MAX = 50

/** 模型生成标题的最大长度 */
const GENERATED_NAME_MAX = 40

/** 空白会话默认展示名 */
export const DEFAULT_SESSION_NAME = '新会话'

/** 已调度或已完成自动命名的会话 */
const autoNameScheduled = new Set<string>()

/**
 * 由首条用户消息生成落库用的临时会话名（单行截断）。
 *
 * @param firstMessage - 用户首条消息原文
 * @returns 非空临时名
 */
export function provisionalSessionName(firstMessage: string): string {
  const oneLine = firstMessage.replace(/\s+/g, ' ').trim()
  if (!oneLine) return DEFAULT_SESSION_NAME
  if (oneLine.length <= PROVISIONAL_NAME_MAX) return oneLine
  return oneLine.slice(0, PROVISIONAL_NAME_MAX)
}

/**
 * 判断当前会话名是否仍可由自动命名覆盖。
 *
 * @param name - 当前会话名
 * @param firstMessage - 首条用户消息
 * @returns 可覆盖时为 true
 */
function isAutoNameEligible(name: string, firstMessage: string): boolean {
  if (name === DEFAULT_SESSION_NAME) return true
  if (name === provisionalSessionName(firstMessage)) return true
  if (/^新会话 \d+$/.test(name)) return true
  if (/^会话 /.test(name)) return true
  return false
}

/**
 * 清洗模型输出为可用会话标题。
 *
 * @param raw - ask 返回原文
 * @returns 清洗后的标题；无效时为空串
 */
function sanitizeGeneratedSessionName(raw: string): string {
  let s = raw.trim()
  const firstLine = s.split(/\r?\n/)[0]
  s = (firstLine ?? '').trim()
  s = s
    .replace(/^["'`「『]+/, '')
    .replace(/["'`」』]+$/, '')
    .trim()
  s = s.replace(/[。.!！？?]+$/u, '').trim()
  if (!s) return ''
  if (s.length > GENERATED_NAME_MAX) s = s.slice(0, GENERATED_NAME_MAX)
  return s
}

/**
 * 根据首条用户消息异步生成会话名并重命名。
 *
 * @param sessionId - 会话 id
 * @param firstMessage - 用户首条消息全文
 * @returns 是否已成功重命名
 */
export async function autoNameSessionFromFirstMessage(
  sessionId: string,
  firstMessage: string
): Promise<boolean> {
  const text = firstMessage.trim()
  if (!sessionId || !text) return false

  if (autoNameScheduled.has(sessionId)) {
    return false
  }
  autoNameScheduled.add(sessionId)

  let sessionAtStart
  try {
    sessionAtStart = await getSession(sessionId)
  } catch {
    autoNameScheduled.delete(sessionId)
    return false
  }

  if (!isAutoNameEligible(sessionAtStart.name, text)) {
    return false
  }

  const provider = resolveChatModel(await getAppSettings())
  if (!provider) {
    agentLog.warn('[session-auto-name] skip: no provider')
    autoNameScheduled.delete(sessionId)
    return false
  }

  const prompt = [
    '根据下面用户的第一条消息，生成会话标题。',
    '要求：不超过 20 个汉字（或等价长度）；不要引号；不要句号；不要解释；只输出标题本身。',
    '',
    '用户消息：',
    text.slice(0, 2000)
  ].join('\n')

  try {
    const raw = await ask(prompt, { provider, maxSteps: 1 })
    const nextName = sanitizeGeneratedSessionName(raw)
    if (!nextName) {
      autoNameScheduled.delete(sessionId)
      return false
    }

    const sessionNow = await getSession(sessionId)
    if (sessionNow.name !== sessionAtStart.name) {
      return false
    }
    if (sessionNow.name === nextName) return false

    await patchSession(sessionId, { name: nextName })
    return true
  } catch (error) {
    autoNameScheduled.delete(sessionId)
    agentLog.warn(
      `[session-auto-name] failed: ${error instanceof Error ? error.message : String(error)}`
    )
    return false
  }
}
