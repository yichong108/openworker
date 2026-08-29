import { EventType, type BaseEvent } from '@ag-ui/client'

import type { TaskChatHint } from '@/components/chat/chat-types'
import { isSafeTaskChatFileName } from '@/lib/task-chat-fs'
import { listTaskChatHints, subscribeTaskChatHints } from '@/lib/task-chat-store'
import { withApiLogContext } from '@/lib/with-api-log-context'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEARTBEAT_MS = 15_000
const encoder = new TextEncoder()

function encodeSse(chunk: string): Uint8Array {
  return encoder.encode(chunk)
}

function sseHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  }
}

/**
 * 任务对话 SSE。
 *
 * - 无 fileName：看板卡片 hint（瘦快照）
 * - 有 fileName：该任务 AG-UI BaseEvent（弹窗 onListenRequest）
 */
export async function GET(request: Request): Promise<Response> {
  return withApiLogContext(request, async () => {
    const fileName = new URL(request.url).searchParams.get('fileName')?.trim()
    if (fileName) {
      if (!isSafeTaskChatFileName(fileName)) {
        return new Response(JSON.stringify({ error: '非法 fileName' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      return eventStream(request, fileName)
    }
    return hintStream(request)
  })
}

function hintStream(request: Request): Response {
  let unsubscribe: (() => void) | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined

  const stream = new ReadableStream({
    start(controller) {
      const safeEnqueue = (text: string): boolean => {
        try {
          controller.enqueue(encodeSse(text))
          return true
        } catch {
          return false
        }
      }

      const sendHints = (hints: Record<string, TaskChatHint>): void => {
        safeEnqueue(`event: chat-hints\ndata: ${JSON.stringify({ hints })}\n\n`)
      }

      sendHints(listTaskChatHints())
      unsubscribe = subscribeTaskChatHints(sendHints)

      heartbeat = setInterval(() => {
        if (!safeEnqueue(`: heartbeat\n\n`)) {
          if (heartbeat) clearInterval(heartbeat)
        }
      }, HEARTBEAT_MS)

      const shutdown = (): void => {
        unsubscribe?.()
        unsubscribe = undefined
        if (heartbeat) {
          clearInterval(heartbeat)
          heartbeat = undefined
        }
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }

      request.signal.addEventListener('abort', shutdown)
    },
    cancel() {
      unsubscribe?.()
      if (heartbeat) clearInterval(heartbeat)
    }
  })

  return new Response(stream, { headers: sseHeaders() })
}

async function eventStream(request: Request, fileName: string): Promise<Response> {
  const { isTaskAgentRunning, subscribeTaskChatEvents } = await import('@/lib/task-agent-runner')

  let unsubscribe: (() => void) | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined

  const stream = new ReadableStream({
    start(controller) {
      const safeEnqueue = (text: string): boolean => {
        try {
          controller.enqueue(encodeSse(text))
          return true
        } catch {
          return false
        }
      }

      const sendEvent = (event: BaseEvent): void => {
        safeEnqueue(`data: ${JSON.stringify(event)}\n\n`)
      }

      unsubscribe = subscribeTaskChatEvents(fileName, sendEvent)
      if (!isTaskAgentRunning(fileName)) {
        sendEvent({ type: EventType.RUN_FINISHED } as BaseEvent)
      }

      heartbeat = setInterval(() => {
        if (!safeEnqueue(`: heartbeat\n\n`)) {
          if (heartbeat) clearInterval(heartbeat)
        }
      }, HEARTBEAT_MS)

      const shutdown = (): void => {
        unsubscribe?.()
        unsubscribe = undefined
        if (heartbeat) {
          clearInterval(heartbeat)
          heartbeat = undefined
        }
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }

      request.signal.addEventListener('abort', shutdown)
    },
    cancel() {
      unsubscribe?.()
      if (heartbeat) clearInterval(heartbeat)
    }
  })

  return new Response(stream, { headers: sseHeaders() })
}
