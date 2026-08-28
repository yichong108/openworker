/**
 * @file ap-agent-with-agui.ts 单元测试
 */

import { EventType } from '@ag-ui/client'
import type { LanguageModel } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { firstValueFrom, toArray } from 'rxjs'

vi.mock('../../../packages/base-agent/src/react-loop.js', () => ({
  runReActLoop: vi.fn(async ({ messages }) => [
    ...messages,
    { role: 'assistant' as const, content: 'hello' }
  ])
}))

import { runReActLoop } from '../../../packages/base-agent/src/react-loop.js'
import { ApAgentWithAGUI } from '../src/ap-agent-with-agui.js'

/** 测试用占位模型 */
const stubModel = { modelId: 'test-model' } as LanguageModel

describe('ApAgentWithAGUI', () => {
  beforeEach(() => {
    vi.mocked(runReActLoop).mockClear()
    vi.mocked(runReActLoop).mockImplementation(async ({ messages }) => [
      ...messages,
      { role: 'assistant' as const, content: 'hello' }
    ])
  })

  it('无 user 消息时 emit RUN_ERROR', async () => {
    const agent = new ApAgentWithAGUI({
      agentId: 'ap',
      description: 'AP test agent',
      cwd: '/tmp/ws',
      provider: stubModel
    })

    const events = await firstValueFrom(
      agent
        .run({
          threadId: 'thread-1',
          runId: 'run-1',
          state: {},
          messages: [],
          tools: [],
          context: [],
          forwardedProps: {}
        })
        .pipe(toArray())
    )

    expect(events.some((e) => e.type === EventType.RUN_STARTED)).toBe(true)
    const errorEvent = events.find((e) => e.type === EventType.RUN_ERROR)
    expect(errorEvent).toBeDefined()
    expect((errorEvent as { message?: string }).message).toContain('user message')
  })

  it('正常 run 发出 RUN_STARTED 与 RUN_FINISHED', async () => {
    const agent = new ApAgentWithAGUI({
      agentId: 'ap',
      description: 'AP test agent',
      cwd: '/tmp/ws',
      provider: stubModel
    })

    const events = await firstValueFrom(
      agent
        .run({
          threadId: 'thread-1',
          runId: 'run-1',
          state: {},
          messages: [{ id: 'u1', role: 'user', content: 'ping' }],
          tools: [],
          context: [],
          forwardedProps: {}
        })
        .pipe(toArray())
    )

    expect(events.some((e) => e.type === EventType.RUN_STARTED)).toBe(true)
    expect(events.some((e) => e.type === EventType.RUN_FINISHED)).toBe(true)
    expect(runReActLoop).toHaveBeenCalledOnce()
  })

  it('abortRun 可取消进行中的 run', async () => {
    vi.mocked(runReActLoop).mockImplementation(
      ({ abortController, messages }) =>
        new Promise((resolve, reject) => {
          if (abortController?.signal.aborted) {
            const err = new Error('Aborted')
            err.name = 'AbortError'
            reject(err)
            return
          }
          const onAbort = () => {
            const err = new Error('Aborted')
            err.name = 'AbortError'
            reject(err)
          }
          abortController?.signal.addEventListener('abort', onAbort, {
            once: true
          })
          setTimeout(() => {
            abortController?.signal.removeEventListener('abort', onAbort)
            resolve([...messages, { role: 'assistant' as const, content: 'hello' }])
          }, 500)
        })
    )

    const agent = new ApAgentWithAGUI({
      agentId: 'ap',
      description: 'AP test agent',
      cwd: '/tmp/ws',
      provider: stubModel
    })

    const abortController = new AbortController()
    const eventsPromise = firstValueFrom(
      agent
        .run({
          threadId: 'thread-1',
          runId: 'run-1',
          state: {},
          messages: [{ id: 'u1', role: 'user', content: 'ping' }],
          tools: [],
          context: [],
          forwardedProps: { abortController }
        })
        .pipe(toArray())
    )

    agent.abortRun()
    const events = await eventsPromise

    expect(events.some((e) => e.type === EventType.RUN_STARTED)).toBe(true)
    const errorEvent = events.find((e) => e.type === EventType.RUN_ERROR)
    expect(errorEvent).toBeDefined()
  })
})
