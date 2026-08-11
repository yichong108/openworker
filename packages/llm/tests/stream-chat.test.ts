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
      const fullStream = (async function* () {
        yield { type: 'text-delta', textDelta: 'hello' }
        yield { type: 'text-delta', textDelta: ' world' }
      })()
      return {
        fullStream,
        text: Promise.resolve('hello world'),
        toolCalls: Promise.resolve([]),
        usage: Promise.resolve({ promptTokens: 1, completionTokens: 2, totalTokens: 3 })
      }
    })
  }
})

import { tool } from 'ai'
import { streamChatStep, toToolDeclarations } from '../src/stream-chat.js'

describe('toToolDeclarations', () => {
  it('去掉 execute，保留 description / parameters', () => {
    const tools = {
      echo: tool({
        description: 'echo',
        parameters: z.object({ text: z.string() }),
        execute: async ({ text }) => text
      })
    }
    const decls = toToolDeclarations(tools)
    expect(decls.echo?.description).toBe('echo')
    expect(decls.echo?.parameters).toBeDefined()
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
