/**
 * @file createBaseAgent.ts 表征测试
 */

import type { LanguageModel, ToolSet } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/react-loop.js', () => ({
  runReActLoop: vi.fn(async ({ messages }) => [
    ...messages,
    { role: 'assistant' as const, content: 'hello' }
  ])
}))

import { createBaseAgent } from '../src/create-base-agent.js'
import { runReActLoop } from '../src/react-loop.js'

const stubModel = { modelId: 'test-model' } as LanguageModel

describe('createBaseAgent', () => {
  beforeEach(() => {
    vi.mocked(runReActLoop).mockClear()
    vi.mocked(runReActLoop).mockImplementation(async ({ messages }) => [
      ...messages,
      { role: 'assistant' as const, content: 'hello' }
    ])
  })

  it('send 空 userText 抛错', async () => {
    const agent = createBaseAgent({ cwd: '/tmp/ws' })
    await expect(agent.send('   ', { provider: stubModel })).rejects.toThrow('userText is empty')
    expect(runReActLoop).not.toHaveBeenCalled()
  })

  it('未传 tools 时使用默认英文 prompt 且仅注册 shell', async () => {
    const agent = createBaseAgent({ cwd: '/tmp/ws' })
    const result = await agent.send('ping', { provider: stubModel })

    expect(runReActLoop).toHaveBeenCalledOnce()
    const [{ systemPrompt, tools, messages }] = vi.mocked(runReActLoop).mock.calls[0]!
    expect(systemPrompt).toBe(
      'You are a helpful assistant that can help with tasks in the workspace at /tmp/ws.'
    )
    expect(Object.keys(tools as ToolSet)).toEqual(['shell'])
    expect(messages).toEqual([{ role: 'user', content: 'ping' }])
    expect(result.result).toBe('hello')
    expect(agent.messages).toEqual(result.messages)
    expect(result.messages.some((m) => m.role === 'system')).toBe(false)
  })

  it('传入 tools 时默认与内置 shell 合并', async () => {
    const agent = createBaseAgent({ cwd: '/tmp/ws' })
    const custom = { ping: { description: 'ping' } } as unknown as ToolSet
    await agent.send('hi', { provider: stubModel, tools: custom })

    const [{ tools }] = vi.mocked(runReActLoop).mock.calls[0]!
    expect(Object.keys(tools as ToolSet).sort()).toEqual(['ping', 'shell'])
  })

  it('toolsMode replace 时作为完整工具集，不合并内置 shell', async () => {
    const agent = createBaseAgent({ cwd: '/tmp/ws' })
    const custom = { ping: { description: 'ping' } } as unknown as ToolSet
    await agent.send('hi', { provider: stubModel, tools: custom, toolsMode: 'replace' })

    const [{ tools }] = vi.mocked(runReActLoop).mock.calls[0]!
    expect(Object.keys(tools as ToolSet)).toEqual(['ping'])
  })

  it('messages 中的 system 抽出为 prompt 且不进入轨迹', async () => {
    const agent = createBaseAgent({ cwd: '/tmp/ws' })
    const result = await agent.send('hi', {
      provider: stubModel,
      messages: [
        { role: 'system', content: '工作区根目录：/other' },
        { role: 'user', content: 'prev' }
      ]
    })

    const [{ systemPrompt, messages }] = vi.mocked(runReActLoop).mock.calls[0]!
    expect(systemPrompt).toBe('工作区根目录：/other')
    expect(messages).toEqual([
      { role: 'user', content: 'prev' },
      { role: 'user', content: 'hi' }
    ])
    expect(result.messages.some((m) => m.role === 'system')).toBe(false)
    expect(agent.messages).toEqual(result.messages)
  })
})
