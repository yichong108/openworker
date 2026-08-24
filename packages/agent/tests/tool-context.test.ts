import type { ToolSet } from 'ai'
import { describe, expect, it } from 'vitest'

import {
  formatToolResultForContext,
  truncateToolObservationResult,
  wrapToolExecuteForContext,
  wrapToolOnTool
} from '../src/tool-context.js'

describe('truncateToolObservationResult', () => {
  it('按工具名截断观测 result', () => {
    const long = 'x'.repeat(2_000)
    expect(truncateToolObservationResult('read_file', long)).toHaveLength(1_000)
    expect(truncateToolObservationResult('delete_file', long)).toBe(long)
  })
})

describe('formatToolResultForContext', () => {
  it('write_file 返回短摘要', () => {
    expect(
      formatToolResultForContext('write_file', {
        path: 'src/a.ts',
        before: '',
        after: 'content',
        created: true
      })
    ).toBe('已写入：src/a.ts')
  })
})

describe('wrapToolExecuteForContext', () => {
  it('write_file 的 execute 返回值裁成短摘要', async () => {
    const tools = wrapToolExecuteForContext({
      write_file: {
        description: 'write',
        execute: async () => ({
          path: 'src/a.ts',
          before: '',
          after: 'content',
          created: true
        })
      }
    } as unknown as ToolSet)

    const result = await tools.write_file?.execute?.({}, {
      toolCallId: '1',
      messages: [],
      abortSignal: new AbortController().signal
    } as never)

    expect(result).toBe('已写入：src/a.ts')
  })
})

describe('wrapToolOnTool', () => {
  it('end 事件截断 result，start 原样透传', () => {
    const seen: Array<{ status: string; result?: string }> = []
    const onTool = wrapToolOnTool((e) => {
      seen.push({ status: e.status, result: e.result })
    })

    onTool({ id: 'read_file', toolCallId: '1', status: 'start', args: '{}' })
    onTool({
      id: 'read_file',
      toolCallId: '1',
      status: 'end',
      result: 'x'.repeat(2_000)
    })

    expect(seen[0]?.result).toBeUndefined()
    expect(seen[1]?.result).toHaveLength(1_000)
  })
})
