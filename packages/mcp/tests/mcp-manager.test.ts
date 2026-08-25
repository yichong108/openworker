/**
 * McpManager 表征测试：不启动真实 stdio MCP。
 */

import { describe, expect, it } from 'vitest'

import { McpManager } from '../src/mcp-manager.js'

const emptyCommand = {
  id: 'x',
  name: 'x',
  enabled: true,
  command: '',
  args: [] as string[]
}

describe('McpManager', () => {
  it('probe：command 为空返回错误', async () => {
    const manager = new McpManager()
    expect(await manager.probe(emptyCommand)).toEqual({
      ok: false,
      error: 'command cannot be empty'
    })
    expect(await manager.probe({ ...emptyCommand, command: '   ' })).toEqual({
      ok: false,
      error: 'command cannot be empty'
    })
  })

  it('warmup：空列表或全 disabled / command 空 → []', async () => {
    const manager = new McpManager()
    expect(await manager.warmup([])).toEqual([])
    expect(
      await manager.warmup([
        { id: 'a', name: 'A', enabled: false, command: 'npx', args: [] },
        { id: 'b', name: 'B', enabled: true, command: '  ', args: [] }
      ])
    ).toEqual([])
  })

  it('new McpManager() 各自独立实例；dispose 空池不抛', async () => {
    const a = new McpManager()
    const b = new McpManager()
    expect(a).not.toBe(b)
    await expect(a.dispose()).resolves.toBeUndefined()
    await expect(b.dispose()).resolves.toBeUndefined()
  })

  it('buildMcpTools：空列表或全 disabled / command 空 → {}', async () => {
    const manager = new McpManager()
    const onTool = () => {}
    expect(await manager.buildMcpTools([], onTool)).toEqual({})
    expect(
      await manager.buildMcpTools(
        [
          { id: 'a', name: 'A', enabled: false, command: 'npx', args: [] },
          { id: 'b', name: 'B', enabled: true, command: '  ', args: [] }
        ],
        onTool
      )
    ).toEqual({})
  })
})
