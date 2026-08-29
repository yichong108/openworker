/**
 * @file create-ap-agent.ts 单元测试
 */

import type { LanguageModel } from 'ai'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../packages/base-agent/src/react-loop.js', () => ({
  runReActLoop: vi.fn(async ({ messages }) => [
    ...messages,
    { role: 'assistant' as const, content: 'hello' }
  ])
}))

import { runReActLoop } from '../../../packages/base-agent/src/react-loop.js'
import { createApAgent } from '../src/create-ap-agent.js'
import { disposeApSkillManager } from '../src/resolve-ap-skills.js'

/** 测试用占位模型 */
const stubModel = { modelId: 'test-model' } as LanguageModel

describe('createApAgent', () => {
  beforeEach(() => {
    disposeApSkillManager()
    vi.mocked(runReActLoop).mockClear()
    vi.mocked(runReActLoop).mockImplementation(async ({ messages }) => [
      ...messages,
      { role: 'assistant' as const, content: 'hello' }
    ])
  })

  it('返回含 send 的实例，不含 mcp', () => {
    const agent = createApAgent({ cwd: '/tmp/ws' })
    expect(agent.send).toBeTypeOf('function')
    expect(agent).not.toHaveProperty('mcp')
    expect(agent.messages).toEqual([])
  })

  it('send 可通过 messages 注入本轮起点历史', async () => {
    const agent = createApAgent({ cwd: '/tmp/ws' })

    const result = await agent.send('next', {
      provider: stubModel,
      messages: [{ role: 'user', content: 'prev' }],
      composerMode: 'ask'
    })

    expect(result.messages).toEqual([
      { role: 'user', content: 'prev' },
      { role: 'user', content: 'next' },
      { role: 'assistant', content: 'hello' }
    ])
    expect(agent.messages).toEqual(result.messages)
  })

  it('send 能跑通', async () => {
    const agent = createApAgent({ cwd: '/tmp/ws' })

    const result = await agent.send('ping', {
      provider: stubModel,
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

  it('build 模式注入 AP skills 摘要与 readSkill 工具', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ap-agent-create-'))
    try {
      const skillDir = path.join(workspaceRoot, '.agents', 'ap-config', 'skills', 'demo')
      await fs.mkdir(skillDir, { recursive: true })
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: demo_skill\ndescription: demo skill\n---\n\n# Demo\n',
        'utf8'
      )

      const agent = createApAgent({ cwd: workspaceRoot })
      await agent.send('修一下报错', {
        provider: stubModel,
        composerMode: 'build'
      })

      const [{ systemPrompt: runPrompt, tools }] = vi.mocked(runReActLoop).mock.calls[0]!
      expect(runPrompt).toContain('可用技能（渐进加载）')
      expect(runPrompt).toContain('demo_skill')
      expect(Object.keys(tools)).toEqual(
        expect.arrayContaining(['readSkillFile', 'readSkillRelativeFile'])
      )
    } finally {
      disposeApSkillManager()
      await fs.rm(workspaceRoot, { recursive: true, force: true })
    }
  })
})
