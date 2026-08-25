import { NextResponse } from 'next/server'

import { createTask, listBoard } from '@/lib/task-fs'
import { taskErrorResponse } from '@/lib/task-api'
import { isTaskPriority } from '@/lib/task-types'

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
 * 在 todo/ 创建任务。
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      title?: unknown
      priority?: unknown
      context?: unknown
      requirements?: unknown
      constraints?: unknown
    }
    if (typeof body.requirements !== 'string' || !body.requirements.trim()) {
      return NextResponse.json({ error: '想法不能为空' }, { status: 400 })
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

    const task = await createTask({
      title: typeof body.title === 'string' ? body.title : '',
      priority:
        typeof body.priority === 'string' && isTaskPriority(body.priority)
          ? body.priority
          : undefined,
      context: typeof body.context === 'string' ? body.context : undefined,
      requirements: typeof body.requirements === 'string' ? body.requirements : undefined,
      constraints: typeof body.constraints === 'string' ? body.constraints : undefined
    })
    return NextResponse.json(task, { status: 201 })
  } catch (error) {
    return taskErrorResponse(error)
  }
}
