import type { Message } from '@ag-ui/client'
import { describe, expect, it } from 'vitest'

import { composeMemorySystemSection, formatProfileSection } from '../src/profile/format.js'
import { extractProfileFacts, parseExtractedFactsJson } from '../src/profile/extract.js'
import { mergeProfileFacts } from '../src/profile/merge.js'
import type { UserFact } from '../src/types.js'

function fact(partial: Partial<UserFact> & Pick<UserFact, 'key' | 'value'>): UserFact {
  return {
    confidence: 0.5,
    updatedAt: 1_000,
    ...partial
  }
}

describe('mergeProfileFacts', () => {
  it('同 key 高 confidence 覆盖', () => {
    const merged = mergeProfileFacts(
      {
        facts: [fact({ key: 'preference.pm', value: 'npm', confidence: 0.4, updatedAt: 1 })],
        updatedAt: 1
      },
      [fact({ key: 'preference.pm', value: 'pnpm', confidence: 0.9, updatedAt: 2 })]
    )
    expect(merged.facts).toHaveLength(1)
    expect(merged.facts[0]?.value).toBe('pnpm')
  })

  it('忽略非法 key 命名空间', () => {
    const merged = mergeProfileFacts(null, [
      fact({ key: 'foo.bar', value: 'x' }),
      fact({ key: 'identity.name', value: 'Ada' })
    ])
    expect(merged.facts).toHaveLength(1)
    expect(merged.facts[0]?.key).toBe('identity.name')
  })
})

describe('formatProfileSection', () => {
  it('空画像返回空串', () => {
    expect(formatProfileSection({ facts: [], updatedAt: 0 })).toBe('')
  })

  it('截断到 profileChars', () => {
    const profile = {
      facts: [
        fact({
          key: 'preference.long',
          value: 'x'.repeat(500),
          confidence: 0.9,
          updatedAt: 10
        })
      ],
      updatedAt: 10
    }
    const text = formatProfileSection(profile, { profileChars: 80 })
    expect(text.startsWith('## User profile')).toBe(true)
    expect(text.length).toBeLessThanOrEqual(80)
  })
})

describe('composeMemorySystemSection', () => {
  it('按 profile 在前拼接', () => {
    const text = composeMemorySystemSection({
      profileSection: '## User profile\n- a',
      sessionSection: '## Session so far (compressed)\nb'
    })
    expect(text.indexOf('User profile')).toBeLessThan(text.indexOf('Session so far'))
  })
})

describe('parseExtractedFactsJson / extractProfileFacts', () => {
  it('解析 JSON 数组与 fenced block', () => {
    const facts = parseExtractedFactsJson(
      '```json\n[{"key":"workflow.git","value":"squash","confidence":0.8}]\n```',
      99
    )
    expect(facts).toHaveLength(1)
    expect(facts[0]?.source).toBe('llm')
    expect(facts[0]?.updatedAt).toBe(99)
  })

  it('非法 JSON 返回空数组', () => {
    expect(parseExtractedFactsJson('not json')).toEqual([])
  })

  it('extractProfileFacts 调用 summarizer', async () => {
    const messages: Message[] = [
      { id: 'u1', role: 'user', content: '请以后都用 TypeScript 和 pnpm' }
    ]
    const facts = await extractProfileFacts({
      messages,
      summarizer: {
        async summarize() {
          return JSON.stringify([
            { key: 'preference.language', value: 'TypeScript', confidence: 0.9 },
            { key: 'preference.packageManager', value: 'pnpm', confidence: 0.85 }
          ])
        }
      }
    })
    expect(facts).toHaveLength(2)
  })

  it('summarizer 失败时返回 []', async () => {
    const facts = await extractProfileFacts({
      messages: [{ id: 'u1', role: 'user', content: 'hi' }],
      summarizer: {
        async summarize() {
          throw new Error('boom')
        }
      }
    })
    expect(facts).toEqual([])
  })
})
