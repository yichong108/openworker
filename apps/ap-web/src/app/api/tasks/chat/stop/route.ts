import { NextResponse } from 'next/server'

import { taskErrorResponse } from '@/lib/task-api'
import { stopTaskAgent } from '@/lib/task-agent-runner'
import { isSafeTaskChatFileName } from '@/lib/task-chat-fs'
import { TaskFsError } from '@/lib/task-fs-error'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 停止任务 Agent 当前 run。
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { fileName?: unknown }
    if (typeof body.fileName !== 'string' || !isSafeTaskChatFileName(body.fileName)) {
      throw new TaskFsError('缺少或非法 fileName', 400)
    }
    const restoredInput = await stopTaskAgent(body.fileName.trim())
    return NextResponse.json({ ok: true, ...(restoredInput ? { restoredInput } : {}) })
  } catch (error) {
    return taskErrorResponse(error)
  }
}
