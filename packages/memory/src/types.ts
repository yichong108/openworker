/**
 * @openworker/memory 公共类型
 *
 * 纯数据形状：不包含 sessionId、Store 或任何 I/O 概念。
 */

import type { Message } from '@ag-ui/client'

/**
 * 单会话压缩预算（按字符近似控制体积；默认约 char/4 ≈ token）。
 * 默认 recentChars（W）= 256_000。
 */
export type SessionBudget = {
  /** 压缩摘要最大字符数 */
  summaryChars: number
  /** 尾部原文窗口最大字符数（W） */
  recentChars: number
}

/**
 * 上一轮压缩留下的工作记忆，作为本轮 compact 的先验输入。
 */
export type SessionWorkingInput = {
  /** 窗口外历史的压缩文本 */
  summary?: string
  /** 需长期保留的约束 / 决策 */
  pinned?: string[]
  /** 重要会话可由宿主标记，供 refineSessionSummary 使用 */
  importance?: 'normal' | 'important'
}

/**
 * compactSessionHistory 的入参。
 */
export type CompactSessionInput = {
  /** 完整 AG-UI 消息列表（含本轮 user） */
  messages: Message[]
  /** 上一轮工作记忆；可为空 */
  prior?: SessionWorkingInput
  /** 覆盖默认预算的部分字段 */
  budget?: Partial<SessionBudget>
}

/**
 * compactSessionHistory 的结果。
 */
export type CompactSessionResult = {
  /** 更新后的窗口外摘要（可交给宿主持久化或回灌为 prior） */
  summary: string
  /** 合并去重后的 pinned */
  pinned: string[]
  /** 应交给模型的尾部原文（AG-UI Message） */
  recentMessages: Message[]
  /** 可直接拼进 system prompt 的段落 */
  systemSection: string
  meta: {
    usedChars: { summary: number; recent: number; pinned: number }
    truncated: boolean
    droppedCount: number
  }
}

/**
 * 可选 LLM 精炼端口；由宿主注入，包内不调度模型。
 */
export type Summarizer = {
  /**
   * 将摘要精炼到 maxChars 以内。
   *
   * @param input.prompt - 精炼提示（含原文摘要与约束）
   * @param input.maxChars - 目标最大字符数
   */
  summarize(input: { prompt: string; maxChars: number }): Promise<string>
}
