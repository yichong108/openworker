/**
 * @file streamChatStep 单元测试
 */

import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>()
  return {
    ...actual,
    streamText: vi.fn(() => {
      const stream = (async function* () {
        yield { type: 'text-delta', text: 'hello' }
        yield { type: 'text-delta', text: ' world' }
      })()
      return {
        stream,
        text: Promise.resolve('hello world'),
        toolCalls: Promise.resolve([]),
        usage: Promise.resolve({
          inputTokens: 1,
          outputTokens: 2,
          totalTokens: 3
        })
      }
    })
  }
})

import { tool } from 'ai'
import { streamChatStep, toToolDeclarations } from '../src/stream-chat.js'

describe('toToolDeclarations', () => {
  it('去掉 execute，保留 description / inputSchema', () => {
    const tools = {
      echo: tool({
        description: 'echo',
        inputSchema: z.object({ text: z.string() }),
        execute: async ({ text }) => text
      })
    }
    const decls = toToolDeclarations(tools)
    expect(decls.echo?.description).toBe('echo')
    expect(decls.echo?.inputSchema).toBeDefined()
    expect(decls.echo?.execute).toBeUndefined()
  })
})

describe('streamChatStep', () => {
  it('经 onTextDelta 流出增量并返回完整结果', async () => {
    const deltas: string[] = []
    const result = await streamChatStep({
      model: {} as never,
      system: 'sys',
      messages: [],
      onTextDelta: (d) => deltas.push(d)
    })
    expect(deltas).toEqual(['hello', ' world'])
    expect(result.text).toBe('hello world')
    expect(result.toolCalls).toEqual([])
    expect(result.streamedLen).toBe(11)
    expect(result.usage.totalTokens).toBe(3)
  })
})
