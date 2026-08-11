/**
 * 会话自动命名：根据用户首条消息，经 uni-agent `ask`（ask 模式、单步）生成短标题并重命名。
 */

import { ask } from '@openworker/uni-agent'

import { resolveChatModel } from '@/main/agent/chat-model'
import { mainLog } from '@/main/logger'
import { getSessionById, getSessionWorkspaceId, renameSession } from '@/main/sessions'
import { getSettings } from '@/main/store'

/** 侧栏展示用临时名最大长度（与输入框全文可不同，避免落库过长） */
const PROVISIONAL_NAME_MAX = 50

/** 模型生成标题的最大长度 */
const GENERATED_NAME_MAX = 40

/** 空白会话默认展示名（输入为空时） */
export const DEFAULT_SESSION_NAME = '新会话'

/** 已调度或已完成自动命名的会话，防止同会话重复调用 ask */
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
 * 同一 sessionId 只会调度一次（成功或进行中均不再重复调用 ask）。
 * 失败时解除占用，允许后续重试。用户已手动改名时静默跳过。
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

  const workspaceId = getSessionWorkspaceId(sessionId)
  if (!workspaceId) {
    autoNameScheduled.delete(sessionId)
    return false
  }

  const sessionAtStart = getSessionById(sessionId)
  if (!sessionAtStart || !isAutoNameEligible(sessionAtStart.name, text)) {
    // 已不可覆盖（例如用户改名）：视为处理完毕，保持占用避免再调 ask
    return false
  }

  const provider = resolveChatModel(getSettings())
  if (!provider) {
    mainLog.warn('[session-auto-name] skip: no provider')
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
    // ask 模式 + 单步，避免工具多轮
    const raw = await ask(prompt, { provider, maxSteps: 1 })
    const nextName = sanitizeGeneratedSessionName(raw)
    if (!nextName) {
      autoNameScheduled.delete(sessionId)
      return false
    }

    const sessionNow = getSessionById(sessionId)
    if (!sessionNow || sessionNow.name !== sessionAtStart.name) {
      return false
    }
    if (sessionNow.name === nextName) return false

    const updated = await renameSession(workspaceId, sessionId, nextName)
    return Boolean(updated)
  } catch (error) {
    autoNameScheduled.delete(sessionId)
    mainLog.warn(
      `[session-auto-name] failed: ${error instanceof Error ? error.message : String(error)}`
    )
    return false
  }
}
