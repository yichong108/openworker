import { listBoard } from '@/lib/task-fs'
import { subscribeTaskBoard } from '@/lib/task-watch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEARTBEAT_MS = 15_000
const encoder = new TextEncoder()

function encodeSse(chunk: string): Uint8Array {
  return encoder.encode(chunk)
}

/**
 * 任务看板 SSE：连接时推当前快照，`.agents` 下任务 markdown 变更后再推。
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

      const sendBoard = (): void => {
        try {
          const board = listBoard()
          safeEnqueue(`event: tasks\ndata: ${JSON.stringify(board)}\n\n`)
        } catch (error) {
          const message = error instanceof Error ? error.message : '无法读取任务'
          safeEnqueue(`event: tasks-error\ndata: ${JSON.stringify({ error: message })}\n\n`)
        }
      }

      sendBoard()
      unsubscribe = subscribeTaskBoard(() => {
        sendBoard()
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
