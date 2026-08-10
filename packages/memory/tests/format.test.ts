import { describe, expect, it } from 'vitest'

import { formatSessionSystemSection } from '../src/format.js'

describe('formatSessionSystemSection', () => {
  it('空内容返回空串', () => {
    expect(formatSessionSystemSection('', [])).toBe('')
  })

  it('同时包含 summary 与 pinned 分区', () => {
    const text = formatSessionSystemSection('did login', ['use pnpm'], 4000)
    expect(text).toContain('## Session so far (compressed)')
    expect(text).toContain('did login')
    expect(text).toContain('## Pinned')
    expect(text).toContain('use pnpm')
  })
})
