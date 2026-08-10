import type { Message } from '@ag-ui/client'
import { describe, expect, it } from 'vitest'

import { compactSessionHistory } from '../src/compact.js'
import { refineSessionSummary } from '../src/summarize.js'

function user(id: string, content: string): Message {
  return { id, role: 'user', content }
}

function assistant(id: string, content: string, toolCallId?: string): Message {
  if (!toolCallId) {
    return { id, role: 'assistant', content }
  }
  return {
    id,
    role: 'assistant',
    content,
    toolCalls: [
      {
        id: toolCallId,
        type: 'function',
        function: { name: 'read_file', arguments: '{"path":"x.ts"}' }
      }
    ]
  }
}

function tool(id: string, toolCallId: string, content: string): Message {
  return { id, role: 'tool', toolCallId, content }
}

describe('compactSessionHistory', () => {
  it('短会话不丢消息且可带 prior', () => {
    const messages = [user('u1', 'hello'), assistant('a1', 'world'), user('u2', 'next')]
    const result = compactSessionHistory({
      messages,
      prior: { summary: 'Earlier work on login', pinned: ['用 pnpm'] }
    })
    expect(result.recentMessages).toHaveLength(3)
    expect(result.summary).toContain('Earlier work on login')
    expect(result.pinned).toContain('用 pnpm')
    expect(result.systemSection).toContain('Session so far')
    expect(result.systemSection).toContain('Pinned')
  })

  it('按预算丢弃早期消息并写入 summary', () => {
    const messages: Message[] = []
    for (let i = 0; i < 20; i += 1) {
      messages.push(user(`u${i}`, `user turn ${i} ${'x'.repeat(200)}`))
      messages.push(assistant(`a${i}`, `assistant turn ${i} ${'y'.repeat(200)}`))
    }
    messages.push(user('ulast', 'final question'))

    const result = compactSessionHistory({
      messages,
      budget: { recentChars: 800, summaryChars: 500 }
    })

    expect(result.meta.droppedCount).toBeGreaterThan(0)
    expect(result.recentMessages.length).toBeLessThan(messages.length)
    expect(result.recentMessages.at(-1)?.role).toBe('user')
    expect(result.summary.length).toBeGreaterThan(0)
    expect(result.meta.usedChars.recent).toBeLessThanOrEqual(800 + 400)
  })

  it('toolCallId 成对保留在 recent 窗口', () => {
    const messages: Message[] = [
      user('u0', 'old ' + 'z'.repeat(500)),
      assistant('a0', 'old reply ' + 'z'.repeat(500)),
      user('u1', 'read please'),
      assistant('a1', '', 'tc-1'),
      tool('t1', 'tc-1', 'file contents here'),
      user('u2', 'thanks')
    ]

    const result = compactSessionHistory({
      messages,
      budget: { recentChars: 400, summaryChars: 300 }
    })

    const roles = result.recentMessages.map((m) => m.role)
    const hasAssistantTool = result.recentMessages.some(
      (m) => m.role === 'assistant' && m.toolCalls?.some((c) => c.id === 'tc-1')
    )
    const hasTool = result.recentMessages.some((m) => m.role === 'tool' && m.toolCallId === 'tc-1')
    // 若窗口含 tool 轨迹，必须成对；若整段被压进 summary，则 recent 可不含
    if (roles.includes('tool') || hasAssistantTool) {
      expect(hasAssistantTool).toBe(true)
      expect(hasTool).toBe(true)
    }
    expect(result.recentMessages.at(-1)?.content).toBe('thanks')
  })

  it('从用户消息抽取 pinned', () => {
    const result = compactSessionHistory({
      messages: [user('u1', '请记住：以后都要用 TypeScript'), assistant('a1', '好的')]
    })
    expect(result.pinned.some((p) => p.includes('TypeScript'))).toBe(true)
  })
})

describe('refineSessionSummary', () => {
  it('调用 Summarizer 并截断', async () => {
    const refined = await refineSessionSummary({
      summary: 'long text about auth and routing',
      pinned: ['use pnpm'],
      maxChars: 50,
      summarizer: {
        async summarize({ maxChars }) {
          return 'x'.repeat(maxChars + 20)
        }
      }
    })
    expect(refined.length).toBeLessThanOrEqual(50)
  })

  it('Summarizer 失败时回退原文截断', async () => {
    const refined = await refineSessionSummary({
      summary: 'abcdef',
      maxChars: 4,
      summarizer: {
        async summarize() {
          throw new Error('boom')
        }
      }
    })
    expect(refined.length).toBe(4)
  })
})
