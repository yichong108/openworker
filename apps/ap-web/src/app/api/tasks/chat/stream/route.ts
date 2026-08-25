import type { ChatTranscript } from '@/components/chat/chat-types'
import { subscribeTaskChat, listTaskChatTranscripts } from '@/lib/task-agent-runner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEARTBEAT_MS = 15_000
const encoder = new TextEncoder()

function encodeSse(chunk: string): Uint8Array {
  return encoder.encode(chunk)
}

/**
 * 任务 Agent 会话 SSE：连接时推全量，之后按任务增量推 chat 事件。
 */
export async function GET(request: Request): Promise<Response> {
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

      const sendSnapshot = (transcripts: Record<string, ChatTranscript>): void => {
        safeEnqueue(`event: chat-snapshot\ndata: ${JSON.stringify({ transcripts })}\n\n`)
      }

      sendSnapshot(listTaskChatTranscripts())
      unsubscribe = subscribeTaskChat((transcripts) => {
        sendSnapshot(transcripts)
      })

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

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  })
}
