import { NextResponse } from 'next/server'

import { taskErrorResponse } from '@/lib/task-api'
import {
  editResendTaskAgentMessage,
  hydrateTaskChatTranscript,
  sendTaskAgentMessage
} from '@/lib/task-agent-runner'
import { readTask } from '@/lib/task-fs'
import { TaskFsError } from '@/lib/task-fs-error'
import { isSafeTaskChatFileName } from '@/lib/task-chat-fs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 手动发送任务对话消息，或编辑重发。
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      taskId?: unknown
      message?: unknown
      editMessageId?: unknown
    }

    if (typeof body.taskId !== 'string' || !body.taskId.trim()) {
      return NextResponse.json({ error: '缺少 taskId' }, { status: 400 })
    }
    if (typeof body.message !== 'string' || !body.message.trim()) {
      return NextResponse.json({ error: '消息不能为空' }, { status: 400 })
    }

    const task = readTask(body.taskId.trim())
    if (typeof body.editMessageId === 'string' && body.editMessageId.trim()) {
      await editResendTaskAgentMessage(task, body.editMessageId.trim(), body.message)
    } else {
      await sendTaskAgentMessage(task, body.message)
    }
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
