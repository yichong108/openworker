import { describe, expect, it } from 'vitest'

import { buildShellTool } from '../src/builtin/shell.js'

describe('buildShellTool', () => {
  it('registers only the shell tool', () => {
    const tools = buildShellTool({
      root: process.cwd(),
      onTool: () => {}
    })

    expect(Object.keys(tools)).toEqual(['shell'])
    expect(tools.shell?.description).toContain('shell')
  })

  it('aborts the running child and reports cancelled', async () => {
    const tools = buildShellTool({
      root: process.cwd(),
      onTool: () => {}
    })
    const execute = tools.shell?.execute
    expect(execute).toBeDefined()

    const abortController = new AbortController()
    const hang = process.platform === 'win32' ? 'ping -n 30 127.0.0.1 >NUL' : 'sleep 30'

    const pending = execute!(
      { command: hang },
      {
        toolCallId: 't1',
        messages: [],
        abortSignal: abortController.signal,
        context: {}
      }
    )

    abortController.abort()
    const result = await pending
    expect(String(result)).toContain('[Command cancelled]')
  })
})
