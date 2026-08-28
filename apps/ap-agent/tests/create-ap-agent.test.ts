/**
 * @file create-ap-agent.ts 单元测试
 */

import type { LanguageModel } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../packages/base-agent/src/react-loop.js', () => ({
  runReActLoop: vi.fn(async ({ messages }) => [
    ...messages,
    { role: 'assistant' as const, content: 'hello' }
  ])
}))

import { runReActLoop } from '../../../packages/base-agent/src/react-loop.js'
import { createApAgent } from '../src/create-ap-agent.js'

/** 测试用占位模型 */
const stubModel = { modelId: 'test-model' } as LanguageModel

describe('createApAgent', () => {
  beforeEach(() => {
    vi.mocked(runReActLoop).mockClear()
    vi.mocked(runReActLoop).mockImplementation(async ({ messages }) => [
      ...messages,
      { role: 'assistant' as const, content: 'hello' }
    ])
  })

  it('返回含 send 的实例，不含 mcp', () => {
    const agent = createApAgent({
      provider: stubModel,
      local: { cwd: '/tmp/ws' }
    })
    expect(agent.send).toBeTypeOf('function')
    expect(agent).not.toHaveProperty('mcp')
    expect(agent.messages).toEqual([])
  })

  it('可注入初始 messages', () => {
    const agent = createApAgent({
      provider: stubModel,
      local: { cwd: '/tmp/ws' },
      messages: [{ role: 'user', content: 'hi' }]
    })
    expect(agent.messages).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('send 能跑通', async () => {
    const agent = createApAgent({
      provider: stubModel,
      local: { cwd: '/tmp/ws' }
    })

    const result = await agent.send('ping', {
      composerMode: 'ask',
      abortController: new AbortController(),
      terminalKey: 'term:s1',
      maxSteps: 10,
      invokeTimeoutMs: 60_000
    })

    expect(runReActLoop).toHaveBeenCalledOnce()
    expect(result.messages).toEqual([
      { role: 'user', content: 'ping' },
      { role: 'assistant', content: 'hello' }
    ])
    expect(result.result).toBe('hello')
    expect(agent.messages).toEqual(result.messages)
  })
})
