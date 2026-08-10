/**
 * Desktop 侧 agent ↔ @openworker/memory 粘合层。
 *
 * 唯一对接点：取/存会话 prior、调用 compact、默认 LLM refine（T=0.7）、
 * 产出 runAgent 用的 messages 与 systemSection。
 * 包内算法见 @openworker/memory；本文件可感知 sessionId，使用进程内 Map（无 API/DB 持久化）。
 */

import type { Message } from '@ag-ui/client'
import {
  compactSessionHistory,
  DEFAULT_REFINE_TEMPERATURE,
  formatSessionSystemSection,
  refineSessionSummary,
  resolveSessionBudget,
  type SessionBudget,
  type SessionWorkingInput,
  type Summarizer
} from '@openworker/memory'
import { generateText, type LanguageModel } from 'ai'

/** 会话工作记忆（summary / pinned），keyed by sessionId */
const workingBySession = new Map<string, { summary: string; pinned: string[] }>()

/**
 * 用当前对话模型构造记忆精炼 Summarizer（temperature 默认 0.7）。
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
        // 字符预算粗转为 token 上限，避免精炼输出过长
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
 * 清除全部会话工作记忆（登出时调用）。
 */
export function clearAllSessionWorking(): void {
  workingBySession.clear()
}

/**
 * 发消息前压缩 AG-UI 历史，供 OpenWorker runAgent 使用。
 *
 * 默认：W=256k 尾部窗口；有新压缩内容时以 T=0.7 调用 LLM refine（可 `refine: false` 关闭）。
 * 返回的 `messages` 为尾部原文窗口；`droppedPrefix` 为被压进 summary 的前缀，
 * 宿主应在 run 结束后拼回完整轨迹以便 UI/落盘。
 *
 * @param input.sessionId - 会话 ID（读写 prior）
 * @param input.messages - 完整 AG-UI 消息（含本轮 user）
 * @param input.budget - 可选预算覆盖（默认 recentChars=256k）
 * @param input.refine - 是否 LLM 精炼摘要，默认 true
 * @param input.summarizer - 精炼器；refine 为 true 且有新压缩内容时需要
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
  // 仅在有新内容进入摘要时精炼，避免每轮重复打模型
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

  const systemSection = formatSessionSystemSection(summary, compacted.pinned, budget.summaryChars)
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
