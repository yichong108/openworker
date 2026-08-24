/**
 * @file create-agent.ts 单元测试
 */

import type { LanguageModel } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@openworker/base-agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@openworker/base-agent')>()
  return {
    ...actual,
    runReActLoop: vi.fn(async ({ messages }) => [
      ...messages,
      { role: 'assistant' as const, content: 'hello' }
    ])
  }
})

const skillManagerMock = {
  init: vi.fn(async () => undefined),
  addSkillRootDir: vi.fn(async () => undefined),
  toPromptAndTools: vi.fn(() => ({ tools: {}, hint: '' }))
}

vi.mock('../src/single-skill-manager.js', () => ({
  getSingleSkillManager: vi.fn(() => skillManagerMock)
}))

vi.mock('@openworker/mcp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@openworker/mcp')>()
  return {
    ...actual,
    buildMcpToolsFromConfig: vi.fn(async () => ({
      tools: {},
      contextHints: '',
      servers: []
    }))
  }
})

import { getSingleSkillManager } from '../src/single-skill-manager.js'

import { createAgent } from '../src/create-agent.js'
import { runReActLoop } from '@openworker/base-agent'

function createCallbacks() {
  return {
    onTextDelta: vi.fn(),
    onTool: vi.fn(),
    onEmit: vi.fn()
  }
}

/** 测试用占位模型（send 不再内部 resolve） */
const stubModel = { modelId: 'test-model' } as LanguageModel

describe('createAgent', () => {
  beforeEach(() => {
    process.env.OPENWORKER_DATA_DIR_NAME = '.openworker-test'
    vi.mocked(runReActLoop).mockClear()
    vi.mocked(runReActLoop).mockImplementation(async ({ messages }) => [
      ...messages,
      { role: 'assistant' as const, content: 'hello' }
    ])
    vi.mocked(getSingleSkillManager).mockClear()
    skillManagerMock.init.mockClear()
    skillManagerMock.addSkillRootDir.mockClear()
    skillManagerMock.toPromptAndTools.mockClear()
    skillManagerMock.toPromptAndTools.mockReturnValue({ tools: {}, hint: '' })
  })

  it('返回含 send / mcp 的实例', () => {
    const agent = createAgent({ provider: stubModel, local: { cwd: '/tmp/ws' } })
    expect(agent.send).toBeTypeOf('function')
    expect(agent.mcp).toBeTypeOf('object')
    expect(agent.messages).toEqual([])
  })

  it('createAgent 可注入初始 messages', () => {
    const agent = createAgent({
      provider: stubModel,
      messages: [{ role: 'user', content: 'hi' }]
    })
    expect(agent.messages).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('send 未传 workspacePath 时回退 local.cwd', async () => {
    const agent = createAgent({ provider: stubModel, local: { cwd: '/tmp/ws' } })
    const callbacks = createCallbacks()

    const result = await agent.send('ping', {
      composerMode: 'ask',
      abortController: new AbortController(),
      terminalKey: 'term:s1',
      ...callbacks,
      maxSteps: 10,
      invokeTimeoutMs: 60_000
    })

    expect(runReActLoop).toHaveBeenCalledOnce()
    const [{ model, systemPrompt: runPrompt }] = vi.mocked(runReActLoop).mock.calls[0]!
    expect(model).toBe(stubModel)
    expect(runPrompt).toContain('工作区根目录：/tmp/ws')
    expect(result.messages).toEqual([
      { role: 'user', content: 'ping' },
      { role: 'assistant', content: 'hello' }
    ])
    expect(result.result).toBe('hello')
    expect(agent.messages).toEqual(result.messages)
  })

  it('send 优先使用本轮 workspacePath', async () => {
    const agent = createAgent({ provider: stubModel, local: { cwd: '/tmp/ws' } })
    const callbacks = createCallbacks()

    await agent.send('ping', {
      composerMode: 'ask',
      abortController: new AbortController(),
      workspacePath: '/other/root',
      ...callbacks
    })

    const [{ systemPrompt: runPrompt }] = vi.mocked(runReActLoop).mock.calls[0]!
    expect(runPrompt).toContain('工作区根目录：/other/root')
  })

  it('send 空 userText 抛错', async () => {
    const agent = createAgent({ provider: stubModel })
    await expect(agent.send('   ')).rejects.toThrow('userText is empty')
  })

  it('send 成功时写回 messages', async () => {
    const agent = createAgent({
      provider: stubModel,
      messages: [{ role: 'user', content: 'prev' }]
    })
    const callbacks = createCallbacks()

    const result = await agent.send('next', {
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

  it('send 取消时抛错且不写回助手消息', async () => {
    const agent = createAgent({ provider: stubModel })
    const callbacks = createCallbacks()
    const abortController = new AbortController()
    vi.mocked(runReActLoop).mockImplementation(async () => {
      abortController.abort()
      throw new Error('Aborted')
    })

    await expect(
      agent.send('hi', {
        composerMode: 'ask',
        abortController,
        ...callbacks
      })
    ).rejects.toThrow('Aborted')

    expect(agent.messages).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('失败时 send 抛错', async () => {
    const agent = createAgent({ provider: stubModel, local: { cwd: '/tmp/ws' } })
    const callbacks = createCallbacks()
    const boom = new Error('model failed')
    vi.mocked(runReActLoop).mockRejectedValueOnce(boom)

    await expect(
      agent.send('hi', {
        composerMode: 'ask',
        ...callbacks
      })
    ).rejects.toThrow('model failed')
  })

  it('build 模式将 skills 名称摘要合并进 system prompt', async () => {
    skillManagerMock.toPromptAndTools.mockReturnValue({
      tools: {},
      hint: '可用技能（渐进加载）：\n- debug_workflow: 故障排查\n- code_review: 代码审查'
    })

    const agent = createAgent({ provider: stubModel, local: { cwd: '/tmp/ws' } })
    await agent.send('修一下报错', { composerMode: 'build' })

    expect(getSingleSkillManager).toHaveBeenCalledOnce()
    expect(skillManagerMock.init).toHaveBeenCalledOnce()
    expect(skillManagerMock.addSkillRootDir).toHaveBeenCalledWith(
      'project',
      expect.stringContaining('.agents')
    )
    const [{ systemPrompt: runPrompt }] = vi.mocked(runReActLoop).mock.calls[0]!
    expect(runPrompt).toContain('可用技能（渐进加载）')
    expect(runPrompt).toContain('debug_workflow')
    expect(runPrompt).toContain('code_review')
  })

  it('ask 模式不加载 skills、不注入技能摘要', async () => {
    skillManagerMock.toPromptAndTools.mockReturnValue({
      tools: {},
      hint: '可用技能（渐进加载）：\n- debug_workflow: 故障排查'
    })

    const agent = createAgent({ provider: stubModel, local: { cwd: '/tmp/ws' } })
    await agent.send('这段代码做什么？', { composerMode: 'ask' })

    expect(getSingleSkillManager).not.toHaveBeenCalled()
    const [{ systemPrompt: runPrompt }] = vi.mocked(runReActLoop).mock.calls[0]!
    expect(runPrompt).not.toContain('可用技能（渐进加载）')
    expect(runPrompt).not.toContain('debug_workflow')
  })

  it('plan 模式不加载 skills，并使用计划 prompt', async () => {
    skillManagerMock.toPromptAndTools.mockReturnValue({
      tools: {},
      hint: '可用技能（渐进加载）：\n- debug_workflow: 故障排查'
    })

    const agent = createAgent({ provider: stubModel, local: { cwd: '/tmp/ws' } })
    await agent.send('设计会话压缩', { composerMode: 'plan' })

    expect(getSingleSkillManager).not.toHaveBeenCalled()
    const [{ systemPrompt: runPrompt }] = vi.mocked(runReActLoop).mock.calls[0]!
    expect(runPrompt).toContain('计划模式')
    expect(runPrompt).toContain('openworker-plan')
    expect(runPrompt).not.toContain('可用技能（渐进加载）')
  })

  it('build 注入 planMarkdown 到 system prompt', async () => {
    const agent = createAgent({ provider: stubModel, local: { cwd: '/tmp/ws' } })
    await agent.send('执行', {
      composerMode: 'build',
      planMarkdown: '# 计划\n- 改 A'
    })

    const [{ systemPrompt: runPrompt }] = vi.mocked(runReActLoop).mock.calls[0]!
    expect(runPrompt).toContain('Approved plan')
    expect(runPrompt).toContain('# 计划')
  })
})
