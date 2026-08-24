/**
 * getDefaultMcpManager 进程级单例。
 */

import { describe, expect, it } from 'vitest'

import { getDefaultMcpManager } from '../src/default-mcp-manager.js'

describe('getDefaultMcpManager', () => {
  it('多次调用返回同一实例', () => {
    expect(getDefaultMcpManager()).toBe(getDefaultMcpManager())
  })
})
