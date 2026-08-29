import { NextResponse } from 'next/server'

import { createTask, listBoard } from '@/lib/task-fs'
import { taskErrorResponse } from '@/lib/task-api'
import { isTaskColumn, isTaskPriority } from '@/lib/task-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 返回四列任务摘要，供看板首屏使用。
 */
export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(listBoard())
  } catch (error) {
    return taskErrorResponse(error)
  }
}

/**
 * 在指定列目录创建任务，默认 todo/。未填名称时立即落盘，标题稍后由 AI 写回。
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      title?: unknown
      priority?: unknown
      description?: unknown
      status?: unknown
    }
    if (typeof body.description !== 'string' || !body.description.trim()) {
      return NextResponse.json({ error: 'description 不能为空' }, { status: 400 })
    }
    if (body.title !== undefined && typeof body.title !== 'string') {
      return NextResponse.json({ error: '名称必须是字符串' }, { status: 400 })
    }
    if (
      body.priority !== undefined &&
      (typeof body.priority !== 'string' || !isTaskPriority(body.priority))
    ) {
      return NextResponse.json({ error: '优先级必须是 P0–P3' }, { status: 400 })
    }
    if (
      body.status !== undefined &&
      (typeof body.status !== 'string' || !isTaskColumn(body.status))
    ) {
      return NextResponse.json({ error: '状态必须是 todo/doing/done/blocked' }, { status: 400 })
    }

    const task = createTask({
      title: typeof body.title === 'string' ? body.title : '',
      priority:
        typeof body.priority === 'string' && isTaskPriority(body.priority)
          ? body.priority
          : undefined,
      description: typeof body.description === 'string' ? body.description : undefined,
      status: typeof body.status === 'string' && isTaskColumn(body.status) ? body.status : undefined
    })
    return NextResponse.json(task, { status: 201 })
  } catch (error) {
    return taskErrorResponse(error)
  }
}
