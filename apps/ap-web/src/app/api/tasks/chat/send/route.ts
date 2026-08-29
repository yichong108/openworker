import { NextResponse } from 'next/server'

import { taskErrorResponse } from '@/lib/task-api'
import {
  editResendTaskAgentMessage,
  hydrateTaskChatTranscript,
  isTaskAgentRunning,
  sendTaskAgentMessage
} from '@/lib/task-agent-runner'
import { isSafeTaskChatFileName } from '@/lib/task-chat-fs'
import { readTask } from '@/lib/task-fs'
import { TaskFsError } from '@/lib/task-fs-error'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 解析本轮用户原文。
 *
 * @param raw - 请求体 text
 * @returns 去空白后的正文
 */
function parseText(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new TaskFsError('缺少 text', 400)
  }
  const text = raw.trim()
  if (!text) {
    throw new TaskFsError('text 不能为空', 400)
  }
  return text
}

/**
 * 解析可选的编辑重发消息 id。
 *
 * @param raw - 请求体 messageId
 * @returns 有则返回 trim 后的 id
 */
function parseMessageId(raw: unknown): string | undefined {
  if (raw == null || raw === '') return undefined
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new TaskFsError('messageId 非法', 400)
  }
  return raw.trim()
}

/**
 * 追加一句用户消息（或从某条 user 编辑重发）并启动 run。
 * 历史由 GET 拉取；本轮 AG-UI 事件由 chat/stream?fileName= 推送。
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      taskId?: unknown
      text?: unknown
      messageId?: unknown
      userMessageId?: unknown
    }

    if (typeof body.taskId !== 'string' || !body.taskId.trim()) {
      return NextResponse.json({ error: '缺少 taskId' }, { status: 400 })
    }

    const text = parseText(body.text)
    const messageId = parseMessageId(body.messageId)
    const task = readTask(body.taskId.trim())
    if (isTaskAgentRunning(task.fileName)) {
      return NextResponse.json(
        { error: '当前任务 Agent 正在运行', code: 'agent_busy' },
        { status: 409 }
      )
    }

    if (messageId) {
      await editResendTaskAgentMessage(task, messageId, text)
    } else {
      await sendTaskAgentMessage(task, text, { id: parseMessageId(body.userMessageId) })
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
