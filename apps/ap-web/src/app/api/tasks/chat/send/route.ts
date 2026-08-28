import { EventType } from '@ag-ui/client'
import { NextResponse } from 'next/server'

import { taskErrorResponse } from '@/lib/task-api'
import {
  hydrateTaskChatTranscript,
  isTaskAgentRunning,
  runTaskAgentFromClientMessages
} from '@/lib/task-agent-runner'
import { readTask } from '@/lib/task-fs'
import { TaskFsError } from '@/lib/task-fs-error'
import { isSafeTaskChatFileName } from '@/lib/task-chat-fs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ClientRunMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const encoder = new TextEncoder()

/**
 * 解析客户端 run 消息列表。
 *
 * @param raw - 请求体 messages
 * @returns 校验后的消息
 */
function parseClientMessages(raw: unknown): ClientRunMessage[] {
  if (!Array.isArray(raw)) {
    throw new TaskFsError('messages 必须是数组', 400)
  }
  const out: ClientRunMessage[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as { id?: unknown; role?: unknown; content?: unknown }
    if (typeof row.id !== 'string' || !row.id.trim()) continue
    if (row.role !== 'user' && row.role !== 'assistant') continue
    if (typeof row.content !== 'string') continue
    out.push({ id: row.id.trim(), role: row.role, content: row.content })
  }
  if (out.length === 0) {
    throw new TaskFsError('messages 不能为空', 400)
  }
  return out
}

/**
 * 以客户端完整 messages 启动 run，响应 AG-UI SSE。
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as {
      taskId?: unknown
      messages?: unknown
    }

    if (typeof body.taskId !== 'string' || !body.taskId.trim()) {
      return NextResponse.json({ error: '缺少 taskId' }, { status: 400 })
    }

    const clientMessages = parseClientMessages(body.messages)
    const task = readTask(body.taskId.trim())
    if (isTaskAgentRunning(task.fileName)) {
      return NextResponse.json(
        { error: '当前任务 Agent 正在运行', code: 'agent_busy' },
        { status: 409 }
      )
    }

    const stream = new ReadableStream({
      async start(controller) {
        const safeEnqueue = (text: string): boolean => {
          try {
            controller.enqueue(encoder.encode(text))
            return true
          } catch {
            return false
          }
        }

        try {
          await runTaskAgentFromClientMessages(task, clientMessages, (event) => {
            safeEnqueue(`data: ${JSON.stringify(event)}\n\n`)
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          const code = error instanceof TaskFsError && error.code ? error.code : undefined
          safeEnqueue(
            `data: ${JSON.stringify({
              type: EventType.RUN_ERROR,
              message,
              ...(code ? { code } : {})
            })}\n\n`
          )
        } finally {
          try {
            controller.close()
          } catch {
            /* already closed */
          }
        }
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
  } catch (error) {
    return taskErrorResponse(error)
  }
}

/**
 * 打开弹窗时 hydrate 磁盘历史。
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url)
    const fileName = url.searchParams.get('fileName')?.trim()
    if (!fileName || !isSafeTaskChatFileName(fileName)) {
      throw new TaskFsError('缺少或非法 fileName', 400)
    }
    const transcript = hydrateTaskChatTranscript(fileName)
    return NextResponse.json({ transcript })
  } catch (error) {
    return taskErrorResponse(error)
  }
}
