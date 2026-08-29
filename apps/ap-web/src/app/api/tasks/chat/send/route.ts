import { NextResponse } from 'next/server'

import { taskErrorResponse } from '@/lib/task-api'
import {
  hydrateTaskChatTranscript,
  isTaskAgentRunning,
  runTaskAgentFromClientMessages
} from '@/lib/task-agent-runner'
import { isSafeTaskChatFileName } from '@/lib/task-chat-fs'
import { readTask } from '@/lib/task-fs'
import { TaskFsError } from '@/lib/task-fs-error'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ClientRunMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

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
 * 以客户端完整 messages 启动 run；会话由 transcript 快照推送，不在此推 AG-UI SSE。
 */
export async function POST(request: Request): Promise<NextResponse> {
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

    runTaskAgentFromClientMessages(task, clientMessages)
    return NextResponse.json({ ok: true })
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
