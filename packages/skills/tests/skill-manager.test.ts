import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { SkillManager } from '../src/skill-manager.js'

const tempDirs: string[] = []

/**
 * 创建临时技能根目录并写入 SKILL.md。
 */
async function makeSkillRoot(
  entries: Array<{
    folder: string
    name: string
    description: string
    body?: string
    extraFiles?: Record<string, string>
  }>
): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ow-skill-mgr-'))
  tempDirs.push(root)
  for (const entry of entries) {
    const dir = path.join(root, entry.folder)
    await fs.mkdir(dir, { recursive: true })
    const md = `---\nname: ${entry.name}\ndescription: ${entry.description}\n---\n\n${entry.body ?? '# Skill'}\n`
    await fs.writeFile(path.join(dir, 'SKILL.md'), md, 'utf8')
    if (entry.extraFiles) {
      for (const [rel, content] of Object.entries(entry.extraFiles)) {
        const filePath = path.join(dir, rel)
        await fs.mkdir(path.dirname(filePath), { recursive: true })
        await fs.writeFile(filePath, content, 'utf8')
      }
    }
  }
  return root
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('SkillManager', () => {
  it('lists skills per pathKey and dedupes by skillRootDirs order', async () => {
    const global = await makeSkillRoot([
      { folder: 'a', name: 'shared', description: 'from global' },
      { folder: 'g-only', name: 'global_only', description: 'global' }
    ])
    const project = await makeSkillRoot([
      { folder: 'b', name: 'shared', description: 'from project' },
      { folder: 'p-only', name: 'project_only', description: 'project' }
    ])

    const manager = new SkillManager()
    await manager.addSkillRootDir('global', global)
    await manager.addSkillRootDir('project', project)

    expect(
      manager
        .getSkills()
        .map((x) => x.name)
        .sort()
    ).toEqual(['global_only', 'project_only', 'shared'])
    expect(
      manager
        .getSkills('global')
        .map((x) => x.name)
        .sort()
    ).toEqual(['global_only', 'shared'])
    expect(
      manager
        .getSkills('project')
        .map((x) => x.name)
        .sort()
    ).toEqual(['project_only'])
    expect(manager.getSkills().find((x) => x.name === 'shared')?.description).toBe('from global')
  })

  it('exposes progressive hint and read tools', async () => {
    const root = await makeSkillRoot([
      {
        folder: 'code-review',
        name: 'code_review',
        description: 'Review code',
        body: 'Do review steps'
      }
    ])

    const manager = new SkillManager()
    await manager.addSkillRootDir('global', root)
    const bundle = manager.toPromptAndTools()

    expect(bundle.hint).toContain('readSkillFile')
    expect(bundle.hint).toContain('/code_review')
    expect(Object.keys(bundle.tools).sort()).toEqual(['readSkillFile', 'readSkillRelativeFile'])
  })

  it('readSkillFile returns SKILL.md body', async () => {
    const root = await makeSkillRoot([
      {
        folder: 'bug-fix',
        name: 'bug_fix',
        description: 'Fix bugs',
        body: 'Fix it like this'
      }
    ])

    const manager = new SkillManager()
    await manager.addSkillRootDir('global', root)
    const { tools } = manager.toPromptAndTools()
    const readSkillFile = tools.readSkillFile
    expect(readSkillFile).toBeDefined()

    const result = await readSkillFile!.execute!({ skillName: 'bug_fix' }, {} as never)
    expect(result).toBe('Fix it like this')
  })

  it('readSkillRelativeFile reads files under skill dir and rejects escape', async () => {
    const root = await makeSkillRoot([
      {
        folder: 'wf',
        name: 'workflow',
        description: 'Workflow',
        extraFiles: { 'references/guide.md': '# Guide content' }
      }
    ])

    const manager = new SkillManager()
    await manager.addSkillRootDir('global', root)
    const { tools } = manager.toPromptAndTools()

    const ok = await tools.readSkillRelativeFile!.execute!(
      { skillName: 'workflow', relativePath: 'references/guide.md' },
      {} as never
    )
    expect(ok).toBe('# Guide content')

    const bad = await tools.readSkillRelativeFile!.execute!(
      { skillName: 'workflow', relativePath: '../outside.md' },
      {} as never
    )
    expect(String(bad)).toContain('Invalid relative path')
  })

  it('removeSkillRootDir drops skills from that pathKey', async () => {
    const global = await makeSkillRoot([{ folder: 'g', name: 'g_skill', description: 'G' }])
    const project = await makeSkillRoot([{ folder: 'p', name: 'p_skill', description: 'P' }])

    const manager = new SkillManager()
    await manager.addSkillRootDir('global', global)
    await manager.addSkillRootDir('project', project)
    expect(
      manager
        .getSkills()
        .map((x) => x.name)
        .sort()
    ).toEqual(['g_skill', 'p_skill'])

    await manager.removeSkillRootDir('project')
    expect(manager.getSkills().map((x) => x.name)).toEqual(['g_skill'])
  })

  it('setSkillRootDirs syncs roots', async () => {
    const a = await makeSkillRoot([{ folder: 'x', name: 'skill_a', description: 'A' }])
    const b = await makeSkillRoot([{ folder: 'y', name: 'skill_b', description: 'B' }])

    const manager = new SkillManager()
    await manager.setSkillRootDirs({ first: a, second: b })
    expect(
      manager
        .getSkills()
        .map((x) => x.name)
        .sort()
    ).toEqual(['skill_a', 'skill_b'])

    await manager.setSkillRootDirs({ second: b })
    expect(manager.getSkills().map((x) => x.name)).toEqual(['skill_b'])
  })

  it('init attaches global on first call and is idempotent for roots', async () => {
    const manager = new SkillManager()
    const onTool1 = vi.fn()
    const onTool2 = vi.fn()

    await manager.init(onTool1)
    const rootsAfterFirst = manager.getSkills('global')
    await manager.init(onTool2)

    expect(rootsAfterFirst).toEqual(manager.getSkills('global'))
    manager.dispose()
  })

  it('dispose becomes no-op', async () => {
    const root = await makeSkillRoot([
      { folder: 'x', name: 'demo', description: 'Demo', body: 'Body' }
    ])
    const manager = new SkillManager()
    await manager.addSkillRootDir('global', root)

    manager.dispose()
    manager.dispose()

    expect(manager.getSkills()).toEqual([])
    await expect(manager.refresh()).resolves.toBeUndefined()
    expect(manager.toPromptAndTools()).toEqual({ hint: '', tools: {} })
    manager.startWatch()
    manager.stopWatch()
  })

  it('watch refreshes skills after directory change', async () => {
    const root = await makeSkillRoot([])
    const manager = new SkillManager()
    await manager.addSkillRootDir('global', root)
    expect(manager.getSkills()).toEqual([])

    const onChange = vi.fn()
    manager.startWatch(onChange)

    const dir = path.join(root, 'new-skill')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'SKILL.md'),
      '---\nname: new_skill\ndescription: New\n---\n\n# New\n',
      'utf8'
    )

    await vi.waitFor(
      () => {
        expect(manager.getSkills().some((x) => x.name === 'new_skill')).toBe(true)
      },
      { timeout: 3000, interval: 100 }
    )

    manager.stopWatch()
    manager.dispose()
  })
})
