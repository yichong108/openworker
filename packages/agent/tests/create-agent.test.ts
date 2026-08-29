/**
 * @file create-agent.ts 单元测试
 */

import type { LanguageModel, ToolSet } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../base-agent/src/react-loop.js', () => ({
  runReActLoop: vi.fn(async ({ messages }) => [
    ...messages,
    { role: 'assistant' as const, content: 'hello' }
  ])
}))

import { createAgent, type AgentRunInput } from '../src/create-agent.js'
import { runReActLoop } from '../../base-agent/src/react-loop.js'

function createCallbacks() {
  return {
    onTextDelta: vi.fn(),
    onTool: vi.fn(),
    onEmit: vi.fn()
  }
}

/** 测试用占位模型 */
const stubModel = { modelId: 'test-model' } as LanguageModel

function runInput(extra: Partial<AgentRunInput> = {}): AgentRunInput {
  return {
    provider: stubModel,
    ...extra
  }
}

describe('createAgent', () => {
  beforeEach(() => {
    vi.mocked(runReActLoop).mockClear()
    vi.mocked(runReActLoop).mockImplementation(async ({ messages }) => [
      ...messages,
      { role: 'assistant' as const, content: 'hello' }
    ])
  })

  it('返回含 send 的实例，不含 mcp', () => {
    const agent = createAgent({ cwd: '/tmp/ws' })
    expect(agent.send).toBeTypeOf('function')
    expect(agent).not.toHaveProperty('mcp')
    expect(agent.messages).toEqual([])
  })

  it('send 可通过 messages 注入本轮起点历史', async () => {
    const agent = createAgent({ cwd: '/tmp/ws' })
    const callbacks = createCallbacks()

    const result = await agent.send('next', {
      ...runInput(),
      messages: [{ role: 'user', content: 'prev' }],
      composerMode: 'ask',
      ...callbacks
    })

    expect(result.messages).toEqual([
      { role: 'user', content: 'prev' },
      { role: 'user', content: 'next' },
      { role: 'assistant', content: 'hello' }
    ])
    expect(agent.messages).toEqual(result.messages)
  })

  it('send 未传 workspacePath 时回退 cwd', async () => {
    const agent = createAgent({ cwd: '/tmp/ws' })
    const callbacks = createCallbacks()

    const result = await agent.send(
      'ping',
      runInput({
        composerMode: 'ask',
        abortController: new AbortController(),
        terminalKey: 'term:s1',
        ...callbacks,
        maxSteps: 10,
        invokeTimeoutMs: 60_000
      })
    )

    expect(runReActLoop).toHaveBeenCalledOnce()
    const [{ model, systemPrompt: runPrompt }] = vi.mocked(runReActLoop).mock.calls[0]!
    expect(model).toBe(stubModel)
    expect(runPrompt).toContain('工作区根目录：/tmp/ws')
    expect(runPrompt).not.toContain('mcp 配置文件路径')
    expect(result.messages).toEqual([
      { role: 'user', content: 'ping' },
      { role: 'assistant', content: 'hello' }
    ])
    expect(result.result).toBe('hello')
    expect(agent.messages).toEqual(result.messages)
  })

  it('send 优先使用本轮 workspacePath', async () => {
    const agent = createAgent({ cwd: '/tmp/ws' })
    const callbacks = createCallbacks()

    await agent.send(
      'ping',
      runInput({
        composerMode: 'ask',
        abortController: new AbortController(),
        workspacePath: '/other/root',
        ...callbacks
      })
    )

    const [{ systemPrompt: runPrompt }] = vi.mocked(runReActLoop).mock.calls[0]!
    expect(runPrompt).toContain('工作区根目录：/other/root')
  })

  it('send 无 workspacePath 且无 cwd 时抛错', async () => {
    const agent = createAgent()
    await expect(agent.send('hi', runInput())).rejects.toThrow('workspacePath is required')
  })

  it('send 空 userText 抛错', async () => {
    const agent = createAgent({ cwd: '/tmp/ws' })
    await expect(agent.send('   ', runInput())).rejects.toThrow('userText is empty')
  })

  it('send 成功时写回 messages', async () => {
    const agent = createAgent({ cwd: '/tmp/ws' })
    agent.messages = [{ role: 'user', content: 'prev' }]
    const callbacks = createCallbacks()

    const result = await agent.send(
      'next',
      runInput({
        composerMode: 'ask',
        ...callbacks
      })
    )

    expect(result.messages).toEqual([
      { role: 'user', content: 'prev' },
      { role: 'user', content: 'next' },
      { role: 'assistant', content: 'hello' }
    ])
    expect(agent.messages).toEqual(result.messages)
  })

  it('send 取消时抛错且不写回助手消息', async () => {
    const agent = createAgent({ cwd: '/tmp/ws' })
    const callbacks = createCallbacks()
    const abortController = new AbortController()
    vi.mocked(runReActLoop).mockImplementation(async () => {
      abortController.abort()
      throw new Error('Aborted')
    })

    await expect(
      agent.send(
        'hi',
        runInput({
          composerMode: 'ask',
          abortController,
          ...callbacks
        })
      )
    ).rejects.toThrow('Aborted')

    expect(agent.messages).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('失败时 send 抛错', async () => {
    const agent = createAgent({ cwd: '/tmp/ws' })
    const callbacks = createCallbacks()
    const boom = new Error('model failed')
    vi.mocked(runReActLoop).mockRejectedValueOnce(boom)

    await expect(
      agent.send(
        'hi',
        runInput({
          composerMode: 'ask',
          ...callbacks
        })
      )
    ).rejects.toThrow('model failed')
  })

  it('未注入 resolveCapabilities 时不出现技能摘要', async () => {
    const agent = createAgent({ cwd: '/tmp/ws' })
    await agent.send('修一下报错', runInput({ composerMode: 'build' }))

    const [{ systemPrompt: runPrompt }] = vi.mocked(runReActLoop).mock.calls[0]!
    expect(runPrompt).not.toContain('可用技能（渐进加载）')
    expect(runPrompt).not.toContain('mcp_list_servers')
  })

  it('resolveCapabilities 的 tools 与 extraPrompt 会合并', async () => {
    const extraExecute = vi.fn(async () => 'ok')
    const agent = createAgent({
      cwd: '/tmp/ws',
      resolveCapabilities: async () => ({
        tools: {
          extra_tool: {
            description: 'extra',
            execute: extraExecute
          }
        } as unknown as ToolSet,
        promptExtras: {
          skillHint: '可用技能（渐进加载）：\n- debug_workflow: 故障排查',
          extraPrompt: 'MCP 上下文：demo'
        }
      })
    })
    await agent.send('修一下报错', runInput({ composerMode: 'build' }))

    const [{ systemPrompt: runPrompt, tools }] = vi.mocked(runReActLoop).mock.calls[0]!
    expect(runPrompt).toContain('可用技能（渐进加载）')
    expect(runPrompt).toContain('debug_workflow')
    expect(runPrompt).toContain('MCP 上下文：demo')
    expect(Object.keys(tools)).toContain('extra_tool')
  })

  it('ask 模式不暴露 shell', async () => {
    const agent = createAgent({ cwd: '/tmp/ws' })
    await agent.send('这段代码做什么？', runInput({ composerMode: 'ask' }))

    const [{ systemPrompt: runPrompt, tools }] = vi.mocked(runReActLoop).mock.calls[0]!
    expect(runPrompt).not.toContain('可用技能（渐进加载）')
    expect(Object.keys(tools)).not.toContain('shell')
  })

  it('plan 模式使用计划 prompt', async () => {
    const agent = createAgent({ cwd: '/tmp/ws' })
    await agent.send('设计会话压缩', runInput({ composerMode: 'plan' }))

    const [{ systemPrompt: runPrompt }] = vi.mocked(runReActLoop).mock.calls[0]!
    expect(runPrompt).toContain('计划模式')
    expect(runPrompt).toContain('openworker-plan')
  })

  it('build 注入 planMarkdown 到 system prompt', async () => {
    const agent = createAgent({ cwd: '/tmp/ws' })
    await agent.send(
      '执行',
      runInput({
        composerMode: 'build',
        planMarkdown: '# 计划\n- 改 A'
      })
    )

    const [{ systemPrompt: runPrompt }] = vi.mocked(runReActLoop).mock.calls[0]!
    expect(runPrompt).toContain('Approved plan')
    expect(runPrompt).toContain('# 计划')
  })
})
