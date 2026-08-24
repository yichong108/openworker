import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { globFilesTool } from '../src/builtin/fs.js'

describe('globFilesTool', () => {
  it('lists workspace files and rejects empty or unsafe patterns', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ow-glob-'))
    await mkdir(path.join(root, 'src'), { recursive: true })
    await writeFile(path.join(root, 'src', 'a.ts'), 'export {}\n')
    await writeFile(path.join(root, 'src', 'b.ts'), 'export {}\n')

    const listed = await globFilesTool(root, '**/*.ts')
    expect(listed).toContain('[工作区]')
    expect(listed).toContain('src/a.ts')
    expect(listed).toContain('src/b.ts')

    expect(await globFilesTool(root, '   ')).toBe('pattern 不能为空')
    expect(await globFilesTool(root, '../x')).toBe('pattern 不能包含 .. 段')
    expect(await globFilesTool(root, 'no-such-*.xyz')).toBe('无匹配文件：no-such-*.xyz')
  })
})
