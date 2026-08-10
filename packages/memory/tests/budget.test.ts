import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SESSION_BUDGET,
  estimateMessageChars,
  resolveSessionBudget,
  truncateChars
} from '../src/budget.js'

describe('budget', () => {
  it('resolveSessionBudget 使用默认值并忽略非法覆盖', () => {
    expect(resolveSessionBudget()).toEqual(DEFAULT_SESSION_BUDGET)
    expect(resolveSessionBudget({ summaryChars: -1, recentChars: 100 })).toEqual({
      summaryChars: DEFAULT_SESSION_BUDGET.summaryChars,
      recentChars: 100
    })
  })

  it('truncateChars 在超长时截断', () => {
    const { text, truncated } = truncateChars('abcdef', 4)
    expect(truncated).toBe(true)
    expect(text.endsWith('…')).toBe(true)
    expect(text.length).toBe(4)
  })

  it('estimateMessageChars 计入 toolCalls', () => {
    const n = estimateMessageChars({
      id: 'a1',
      role: 'assistant',
      content: 'hi',
      toolCalls: [
        {
          id: 't1',
          type: 'function',
          function: { name: 'read_file', arguments: '{"path":"a.ts"}' }
        }
      ]
    })
    expect(n).toBeGreaterThan(2)
  })
})
