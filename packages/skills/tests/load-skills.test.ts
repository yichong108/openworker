import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  listSkillsFromPaths,
  loadSkillsFromPaths,
  parseSkillFrontmatter
} from '../src/load-skills.js'

const tempDirs: string[] = []

/**
 * 创建临时技能目录并写入 SKILL.md。
 */
async function makeSkillRoot(
  entries: Array<{
    folder: string
    name: string
    description: string
    body?: string
  }>
): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ow-skills-'))
  tempDirs.push(root)
  for (const entry of entries) {
    const dir = path.join(root, entry.folder)
    await fs.mkdir(dir, { recursive: true })
    const md = `---\nname: ${entry.name}\ndescription: ${entry.description}\n---\n\n${entry.body ?? '# Skill'}\n`
    await fs.writeFile(path.join(dir, 'SKILL.md'), md, 'utf8')
  }
  return root
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('parseSkillFrontmatter', () => {
  it('parses folded block scalar description (>)', () => {
    const md = `---
name: choice
description: >
  在涉及利害关系的决策中，先以对话方式逐个探询并确认背景，再列出可选方案及其得失与坑点。
  当行动可能损害用户利益（资金、数据、权限、声誉、不可逆操作、合规/安全等）时必须使用；
  也适用于用户在取舍、风险、是否继续、方案对比中犹豫时。
license: MIT
---

# Choice
`
    const parsed = parseSkillFrontmatter(md)
    expect(parsed?.meta.name).toBe('choice')
    expect(parsed?.meta.description).toContain('在涉及利害关系的决策中')
    expect(parsed?.meta.description).not.toBe('>')
  })

  it('parses inline description', () => {
    const md = `---
name: demo
description: Short inline text
---

# Demo
`
    const parsed = parseSkillFrontmatter(md)
    expect(parsed?.meta.description).toBe('Short inline text')
  })
})

describe('listSkillsFromPaths', () => {
  it('lists skill metadata without requiring tools', async () => {
    const root = await makeSkillRoot([
      {
        folder: 'code-review',
        name: 'code_review',
        description: 'Review code'
      },
      { folder: 'bug-fix', name: 'bug_fix', description: 'Fix bugs' }
    ])
    const list = await listSkillsFromPaths([root])
    expect(list.map((x) => x.name).sort()).toEqual(['bug_fix', 'code_review'])
    expect(list.find((x) => x.name === 'code_review')?.description).toBe('Review code')
  })

  it('dedupes by name with first path winning', async () => {
    const first = await makeSkillRoot([{ folder: 'a', name: 'shared', description: 'from first' }])
    const second = await makeSkillRoot([
      { folder: 'b', name: 'shared', description: 'from second' }
    ])
    const list = await listSkillsFromPaths([first, second])
    expect(list).toHaveLength(1)
    expect(list[0]?.description).toBe('from first')
  })

  it('returns empty array for missing paths', async () => {
    const list = await listSkillsFromPaths([path.join(os.tmpdir(), 'ow-missing-skills-dir')])
    expect(list).toEqual([])
  })
})

describe('loadSkillsFromPaths', () => {
  it('registers tools with matching names from listSkillsFromPaths', async () => {
    const root = await makeSkillRoot([
      {
        folder: 'code-review',
        name: 'code_review',
        description: 'Review code',
        body: 'Do review'
      }
    ])
    const listed = await listSkillsFromPaths([root])
    const loaded = await loadSkillsFromPaths([root], () => undefined)
    expect(Object.keys(loaded.tools).sort()).toEqual(listed.map((x) => x.name).sort())
    expect(loaded.hint).toContain('/code_review')
  })
})
