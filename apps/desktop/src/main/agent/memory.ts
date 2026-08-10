/**
 * Desktop 侧 agent ↔ @openworker/memory 粘合层。
 *
 * 唯一对接点：会话 compact + 用户画像读写/抽取、产出 runAgent 用的 messages 与 systemSection。
 * 包内算法见 @openworker/memory；会话 prior 用进程内 Map；画像经 API `/me/profile` 持久化。
 */

import type { Message } from '@ag-ui/client'
import {
  compactSessionHistory,
  composeMemorySystemSection,
  DEFAULT_REFINE_TEMPERATURE,
  extractProfileFacts,
  formatProfileSection,
  formatSessionSystemSection,
  mergeProfileFacts,
  refineSessionSummary,
  resolveSessionBudget,
  type SessionBudget,
  type SessionWorkingInput,
  type Summarizer,
  type UserProfile
} from '@openworker/memory'
import { generateText, type LanguageModel } from 'ai'

import { getAccessToken } from '@/main/auth-token'
import { agentLog } from '@/main/agent/agent-log'
import { apiGetUserProfile, apiPutUserProfile } from '@/main/user-profile-api'

/** 会话工作记忆（summary / pinned），keyed by sessionId */
const workingBySession = new Map<string, { summary: string; pinned: string[] }>()

/** 当前登录用户画像缓存（登出清空） */
let profileCache: UserProfile | null = null

/** 抽取画像时取最近消息条数上限 */
const PROFILE_EXTRACT_MESSAGE_LIMIT = 12

/**
 * 用当前对话模型构造记忆精炼 / 抽取 Summarizer（temperature 默认 0.7）。
 *
 * @param model - AI SDK LanguageModel
 * @param temperature - 采样温度，默认 DEFAULT_REFINE_TEMPERATURE
 * @returns Summarizer
 */
export function createMemorySummarizer(
  model: LanguageModel,
  temperature: number = DEFAULT_REFINE_TEMPERATURE
): Summarizer {
  return {
    async summarize({ prompt, maxChars }) {
      const { text } = await generateText({
        model,
        prompt,
        temperature,
        maxTokens: Math.min(8_192, Math.max(256, Math.ceil(maxChars / 2)))
      })
      return text
    }
  }
}

/**
 * 读取会话工作记忆（上一轮 compact 结果）。
 *
 * @param sessionId - 会话 ID
 * @returns prior 形状；无则空对象
 */
export function loadSessionWorking(sessionId: string): SessionWorkingInput {
  const stored = workingBySession.get(sessionId)
  if (!stored) return {}
  return {
    summary: stored.summary,
    pinned: [...stored.pinned]
  }
}

/**
 * 写入会话工作记忆。
 *
 * @param sessionId - 会话 ID
 * @param working - summary / pinned
 */
export function saveSessionWorking(
  sessionId: string,
  working: { summary: string; pinned: string[] }
): void {
  workingBySession.set(sessionId, {
    summary: working.summary,
    pinned: [...working.pinned]
  })
}

/**
 * 清除单个会话的工作记忆（删会话 / 编辑截断历史时调用）。
 *
 * @param sessionId - 会话 ID
 */
export function clearSessionWorking(sessionId: string): void {
  workingBySession.delete(sessionId)
}

/**
 * 清除全部会话工作记忆与用户画像缓存（登出时调用）。
 */
export function clearAllSessionWorking(): void {
  workingBySession.clear()
  profileCache = null
}

/**
 * 从 API 加载用户画像（带进程内缓存）。
 *
 * 无 token 或失败时返回空 facts，不抛出。
 *
 * @param force - 为 true 时跳过缓存强制拉取
 * @returns UserProfile
 */
export async function loadUserProfile(force: boolean = false): Promise<UserProfile> {
  if (!force && profileCache) {
    return {
      facts: [...profileCache.facts],
      updatedAt: profileCache.updatedAt
    }
  }
  if (!getAccessToken()) {
    profileCache = { facts: [], updatedAt: 0 }
    return { facts: [], updatedAt: 0 }
  }
  try {
    const dto = await apiGetUserProfile()
    profileCache = {
      facts: Array.isArray(dto.facts) ? dto.facts : [],
      updatedAt: typeof dto.updatedAt === 'number' ? dto.updatedAt : 0
    }
  } catch (error) {
    agentLog.warn(
      `[memory] loadUserProfile failed: ${error instanceof Error ? error.message : String(error)}`
    )
    if (!profileCache) {
      profileCache = { facts: [], updatedAt: 0 }
    }
  }
  return {
    facts: [...(profileCache?.facts ?? [])],
    updatedAt: profileCache?.updatedAt ?? 0
  }
}

/**
 * 将用户画像整包写入 API 并更新缓存。
 *
 * @param profile - 合并后的画像
 */
export async function saveUserProfile(profile: UserProfile): Promise<void> {
  if (!getAccessToken()) {
    profileCache = profile
    return
  }
  try {
    const saved = await apiPutUserProfile({ facts: profile.facts })
    profileCache = {
      facts: Array.isArray(saved.facts) ? saved.facts : profile.facts,
      updatedAt: typeof saved.updatedAt === 'number' ? saved.updatedAt : profile.updatedAt
    }
  } catch (error) {
    agentLog.warn(
      `[memory] saveUserProfile failed: ${error instanceof Error ? error.message : String(error)}`
    )
    // 仍更新本地缓存，避免同进程内读不到刚 merge 的结果
    profileCache = profile
  }
}

/**
 * 发消息前压缩 AG-UI 历史并注入用户画像，供 OpenWorker runAgent 使用。
 *
 * 默认：W=256k 尾部窗口；有新压缩内容时以 T=0.7 refine；画像从 API 读取并拼入 system。
 *
 * @param input.sessionId - 会话 ID（读写 prior）
 * @param input.messages - 完整 AG-UI 消息（含本轮 user）
 * @param input.budget - 可选预算覆盖
 * @param input.refine - 是否 LLM 精炼会话摘要，默认 true
 * @param input.summarizer - 精炼器
 * @returns 压缩后的 messages、systemSection、working 与 droppedPrefix
 */
export async function prepareSessionMemory(input: {
  sessionId: string
  messages: Message[]
  budget?: Partial<SessionBudget>
  refine?: boolean
  summarizer?: Summarizer
}): Promise<{
  messages: Message[]
  systemSection: string
  working: { summary: string; pinned: string[] }
  droppedPrefix: Message[]
}> {
  const prior = loadSessionWorking(input.sessionId)
  const budget = resolveSessionBudget(input.budget)
  const compacted = compactSessionHistory({
    messages: input.messages,
    prior,
    budget
  })

  let summary = compacted.summary
  const refineEnabled = input.refine !== false
  const shouldRefine =
    refineEnabled &&
    Boolean(input.summarizer) &&
    summary.trim().length > 0 &&
    compacted.meta.droppedCount > 0

  if (shouldRefine && input.summarizer) {
    summary = await refineSessionSummary({
      summary,
      pinned: compacted.pinned,
      summarizer: input.summarizer,
      maxChars: budget.summaryChars
    })
  }

  const sessionSection = formatSessionSystemSection(summary, compacted.pinned, budget.summaryChars)
  const profile = await loadUserProfile()
  const profileSection = formatProfileSection(profile)
  const systemSection = composeMemorySystemSection({ profileSection, sessionSection })

  const working = { summary, pinned: compacted.pinned }
  saveSessionWorking(input.sessionId, working)

  const recent = compacted.recentMessages
  const cutIndex = Math.max(0, input.messages.length - recent.length)
  let droppedPrefix = input.messages.slice(0, cutIndex)
  if (recent.length > 0) {
    const firstRecent = recent[0]
    const idx = input.messages.findIndex((m) => m.id === firstRecent?.id)
    if (idx >= 0) {
      droppedPrefix = input.messages.slice(0, idx)
    }
  }

  return {
    messages: recent,
    systemSection,
    working,
    droppedPrefix
  }
}

/**
 * OpenWorker 一轮成功后：LLM 抽取用户事实 → merge → PUT /me/profile。
 *
 * 默认开启；失败只打日志。Cursor 路径不应调用。
 *
 * @param input.messages - 完整或近期 AG-UI 消息
 * @param input.summarizer - 宿主 Summarizer
 * @param input.extractProfile - 是否抽取，默认 true
 */
export async function refreshUserProfileFromMessages(input: {
  messages: Message[]
  summarizer?: Summarizer
  extractProfile?: boolean
}): Promise<void> {
  if (input.extractProfile === false) return
  if (!input.summarizer) return
  if (!getAccessToken()) return

  const slice = (input.messages ?? []).slice(-PROFILE_EXTRACT_MESSAGE_LIMIT)
  if (slice.length === 0) return

  try {
    const prior = await loadUserProfile()
    const extracted = await extractProfileFacts({
      messages: slice,
      prior,
      summarizer: input.summarizer
    })
    if (extracted.length === 0) return

    const merged = mergeProfileFacts(prior, extracted)
    await saveUserProfile(merged)
  } catch (error) {
    agentLog.warn(
      `[memory] refreshUserProfileFromMessages failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
}
