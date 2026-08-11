/**
 * 简单问答：临时创建 UniAgent，跑一轮后返回助手纯文本。
 */

import { randomUUID, type Message } from '@ag-ui/client'
import type { LanguageModel } from 'ai'

import { UniAgent } from './uni-agent.js'

/**
 * `ask` 运行选项。
 *
 * provider 必填；其余字段用于工作区与取消控制。
 * 固定以 `composerMode: 'ask'` 运行。
 */
export type AskOptions = {
  /** 对话模型 */
  provider: LanguageModel
  /** 工作区根目录 */
  cwd?: string
  /** 本轮取消控制器 */
  abortController?: AbortController
  /** AG-UI agentId（默认 uni-ask） */
  agentId?: string
  /** AG-UI threadId */
  threadId?: string
  /**
   * ReAct 最大步数；未传时由后端默认。
   * 简单标题生成等场景建议传 `1`，避免多轮工具调用。
   */
  maxSteps?: number
}

/**
 * 将 AG-UI Message.content 转为纯文本。
 *
 * @param content - AG-UI Message.content
 * @returns 纯文本；无法解析时返回空串
 */
function messageContentToText(content: Message['content']): string {
  if (content == null) return ''
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (
        part &&
        typeof part === 'object' &&
        'type' in part &&
        part.type === 'text' &&
        'text' in part
      ) {
        return typeof part.text === 'string' ? part.text : ''
      }
      return ''
    })
    .join('')
}

/**
 * 从消息列表末尾提取最后一条 assistant 纯文本。
 *
 * @param messages - AG-UI 消息列表
 * @returns 助手回答；无 assistant 时返回空串
 */
function extractLastAssistantText(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i]
    if (msg?.role === 'assistant') {
      return messageContentToText(msg.content)
    }
  }
  return ''
}

/**
 * 简单问答：创建临时 UniAgent，发送 question，返回助手 answer。
 *
 * 内部以 `composerMode: 'ask'` 跑一轮 `runAgent`，结束后 dispose 临时实例。
 * 不维护会话历史；适合一次性问答场景。
 *
 * @param question - 用户问题（非空字符串）
 * @param options - 至少需提供 provider
 * @returns 助手回答纯文本（无正文时为空串）
 * @throws {Error} question 为空、未配置 provider，或 run 失败时抛出
 */
export async function ask(question: string, options: AskOptions): Promise<string> {
  const text = question.trim()
  if (!text) {
    throw new Error('question 不能为空')
  }
  if (!options?.provider) {
    throw new Error('请先配置 provider')
  }

  const agent = new UniAgent({
    role: 'session',
    agentId: options.agentId ?? 'uni-ask',
    description: 'OpenWorker simple ask',
    provider: options.provider,
    ...(options.cwd?.trim() ? { cwd: options.cwd.trim() } : {}),
    ...(options.threadId ? { threadId: options.threadId } : {})
  })

  try {
    agent.assertReady({ provider: options.provider })

    const userMessage: Message = {
      id: randomUUID(),
      role: 'user',
      content: text
    }
    agent.messages = [userMessage]

    const forwardedProps = agent.buildRunForwardedProps({
      composerMode: 'ask',
      abortController: options.abortController,
      workspacePath: options.cwd?.trim() || undefined,
      provider: options.provider,
      ...(options.maxSteps != null ? { maxSteps: options.maxSteps } : {})
    })

    await agent.runAgent({
      runId: `ask-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tools: [],
      context: [],
      forwardedProps
    })

    return extractLastAssistantText(agent.messages)
  } finally {
    await agent.dispose()
  }
}
