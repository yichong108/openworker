import { NextResponse } from 'next/server'

import { taskErrorResponse, taskIdFromParams } from '@/lib/task-api'
import { moveTask, readTask } from '@/lib/task-fs'
import { isTaskColumn } from '@/lib/task-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = {
  params: { id: string[] }
}

/**
 * 读取单个任务详情，供卡片展开使用。
 */
export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const id = taskIdFromParams(context.params.id)
    return NextResponse.json(readTask(id))
  } catch (error) {
    return taskErrorResponse(error)
  }
}

/**
 * 移动任务到目标列并同步文件内 Status。
 */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const id = taskIdFromParams(context.params.id)
    const body = (await request.json()) as { status?: unknown }
    if (typeof body.status !== 'string' || !isTaskColumn(body.status)) {
      return NextResponse.json({ error: 'status 必须是 todo/doing/done/blocked' }, { status: 400 })
    }
    return NextResponse.json(moveTask(id, body.status))
  } catch (error) {
    return taskErrorResponse(error)
  }
}
