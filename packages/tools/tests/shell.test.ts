import { describe, expect, it } from 'vitest'

import { buildShellTool } from '../src/builtin/shell.js'

describe('buildShellTool', () => {
  it('registers only the shell tool', () => {
    const tools = buildShellTool({
      terminalKey: 'term:test',
      root: process.cwd(),
      onTool: () => {}
    })

    expect(Object.keys(tools)).toEqual(['shell'])
    expect(tools.shell?.description).toContain('shell')
  })
})
