/**
 * @file plan-artifact.ts 单元测试
 */

import { describe, expect, it } from 'vitest'
import { normalizeComposerMode } from '@openworker/shared'

import {
  buildApprovedPlanSystemSection,
  extractPlanTitle,
  parsePlanArtifact
} from '../src/plan-artifact.js'
import { buildWorkspaceRunPrompt, buildWorkspaceTools } from '../src/workspace-tools.js'

describe('normalizeComposerMode', () => {
  it('识别 ask / plan，其余回退 build', () => {
    expect(normalizeComposerMode('ask')).toBe('ask')
    expect(normalizeComposerMode('plan')).toBe('plan')
    expect(normalizeComposerMode('build')).toBe('build')
    expect(normalizeComposerMode(undefined)).toBe('build')
    expect(normalizeComposerMode('nope' as 'build')).toBe('build')
  })
})

describe('parsePlanArtifact', () => {
  it('从 openworker-plan 围栏提取计划', () => {
    const text = `说明如下。

\`\`\`openworker-plan
# 标题
- step 1
\`\`\`

额外说明。`

    const parsed = parsePlanArtifact(text)
    expect(parsed).not.toBeNull()
    expect(parsed!.fromFence).toBe(true)
    expect(parsed!.markdown).toContain('# 标题')
    expect(parsed!.markdown).toContain('step 1')
    expect(parsed!.title).toBe('标题')
    expect(parsed!.remainder).toContain('说明如下')
    expect(parsed!.remainder).toContain('额外说明')
  })

  it('无围栏时整段降级为计划', () => {
    const parsed = parsePlanArtifact('## 方案\n做 A 再做 B')
    expect(parsed).not.toBeNull()
    expect(parsed!.fromFence).toBe(false)
    expect(parsed!.markdown).toBe('## 方案\n做 A 再做 B')
    expect(parsed!.title).toBe('方案')
    expect(parsed!.remainder).toBe('')
  })

  it('空文本返回 null', () => {
    expect(parsePlanArtifact('')).toBeNull()
    expect(parsePlanArtifact('   ')).toBeNull()
  })
})

describe('buildApprovedPlanSystemSection', () => {
  it('空输入返回空串', () => {
    expect(buildApprovedPlanSystemSection('')).toBe('')
    expect(buildApprovedPlanSystemSection('  ')).toBe('')
  })

  it('注入 Approved plan 段落', () => {
    const section = buildApprovedPlanSystemSection('# Go\n1. a')
    expect(section).toContain('Approved plan')
    expect(section).toContain('```openworker-plan')
    expect(section).toContain('# Go')
  })
})

describe('extractPlanTitle', () => {
  it('取首个标题', () => {
    expect(extractPlanTitle('# A\n## B')).toBe('A')
    expect(extractPlanTitle('前言\n## Mid')).toBe('Mid')
    expect(extractPlanTitle('no title')).toBeUndefined()
  })
})

describe('plan mode tools & prompt', () => {
  it('plan 与 ask 一样只暴露只读工具', () => {
    const onTool = () => {}
    const askTools = buildWorkspaceTools({
      root: '/tmp/ws',
      onTool,
      mode: 'ask'
    })
    const planTools = buildWorkspaceTools({
      root: '/tmp/ws',
      onTool,
      mode: 'plan'
    })
    expect(Object.keys(askTools).sort()).toEqual(Object.keys(planTools).sort())
    expect(planTools.write_file).toBeUndefined()
    expect(planTools.shell).toBeUndefined()
    expect(planTools.read_file).toBeDefined()
  })

  it('plan prompt 要求 openworker-plan 围栏', () => {
    const prompt = buildWorkspaceRunPrompt('plan', '/tmp/ws')
    expect(prompt).toContain('计划模式')
    expect(prompt).toContain('openworker-plan')
    expect(prompt).toContain('禁止修改工作区文件')
    expect(prompt).not.toContain('mcp 配置文件路径')
  })
})
