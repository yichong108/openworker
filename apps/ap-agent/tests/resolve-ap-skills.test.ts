/**
 * @file resolve-ap-skills.ts 单元测试
 */

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { disposeApSkillManager, loadApSkills } from '../src/resolve-ap-skills.js'

const tempDirs: string[] = []

async function makeWorkspaceSkill(
  workspaceRoot: string,
  rootRel: string,
  folder: string,
  name: string,
  description: string
): Promise<void> {
  const skillDir = path.join(workspaceRoot, ...rootRel.split('/'), folder)
  await fs.mkdir(skillDir, { recursive: true })
  const md = `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`
  await fs.writeFile(path.join(skillDir, 'SKILL.md'), md, 'utf8')
}

async function makeWorkspace(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ap-agent-skills-'))
  tempDirs.push(root)
  return root
}

afterEach(() => {
  disposeApSkillManager()
})

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('loadApSkills', () => {
  it('ask / plan 模式不加载技能', async () => {
    const workspaceRoot = await makeWorkspace()
    await makeWorkspaceSkill(
      workspaceRoot,
      '.agents/ap-config/skills',
      'ap-task-execute',
      'ap_task_execute',
      '执行任务'
    )

    const ask = await loadApSkills('ask', workspaceRoot, () => {})
    const plan = await loadApSkills('plan', workspaceRoot, () => {})

    expect(ask.tools).toEqual({})
    expect(ask.promptExtras).toEqual({})
    expect(plan.tools).toEqual({})
    expect(plan.promptExtras).toEqual({})
  })

  it('build 模式从 ap-config 与 project skills 加载，同名时内置优先', async () => {
    const workspaceRoot = await makeWorkspace()
    await makeWorkspaceSkill(
      workspaceRoot,
      '.agents/ap-config/skills',
      'shared',
      'shared_skill',
      'from builtin'
    )
    await makeWorkspaceSkill(
      workspaceRoot,
      '.agents/skills',
      'shared',
      'shared_skill',
      'from project'
    )
    await makeWorkspaceSkill(
      workspaceRoot,
      '.agents/skills',
      'project-only',
      'project_only',
      'project skill'
    )

    const bundle = await loadApSkills('build', workspaceRoot, () => {})

    expect(Object.keys(bundle.tools ?? {})).toEqual(
      expect.arrayContaining(['readSkillFile', 'readSkillRelativeFile'])
    )
    expect(bundle.promptExtras?.skillHint).toContain('可用技能（渐进加载）')
    expect(bundle.promptExtras?.skillHint).toContain('shared_skill: from builtin')
    expect(bundle.promptExtras?.skillHint).toContain('project_only: project skill')
    expect(bundle.promptExtras?.skillHint).not.toContain('from project')
  })
})
