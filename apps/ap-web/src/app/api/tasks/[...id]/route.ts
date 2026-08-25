import { NextResponse } from 'next/server'

import { taskErrorResponse, taskIdFromParams } from '@/lib/task-api'
import { moveTask, readTask, updateTask } from '@/lib/task-fs'
import { isTaskColumn, isTaskPriority } from '@/lib/task-types'
import type { UpdateTaskInput } from '@/lib/task-types'

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
 * 更新任务字段，和/或移动到目标列并同步文件内 Status。
 */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const id = taskIdFromParams(context.params.id)
    const body = (await request.json()) as {
      status?: unknown
      title?: unknown
      priority?: unknown
      context?: unknown
      requirements?: unknown
      constraints?: unknown
    }

    const hasStatus = body.status !== undefined
    const hasFields =
      body.title !== undefined ||
      body.priority !== undefined ||
      body.context !== undefined ||
      body.requirements !== undefined ||
      body.constraints !== undefined

    if (!hasStatus && !hasFields) {
      return NextResponse.json({ error: '缺少更新字段' }, { status: 400 })
    }

    if (hasStatus && (typeof body.status !== 'string' || !isTaskColumn(body.status))) {
      return NextResponse.json({ error: 'status 必须是 todo/doing/done/blocked' }, { status: 400 })
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
    if (body.context !== undefined && typeof body.context !== 'string') {
      return NextResponse.json({ error: 'Context 必须是字符串' }, { status: 400 })
    }
    if (body.requirements !== undefined && typeof body.requirements !== 'string') {
      return NextResponse.json({ error: '想法必须是字符串' }, { status: 400 })
    }
    if (body.constraints !== undefined && typeof body.constraints !== 'string') {
      return NextResponse.json({ error: 'Constraints 必须是字符串' }, { status: 400 })
    }

    let currentId = id
    if (hasFields) {
      const input: UpdateTaskInput = {}
      if (typeof body.title === 'string') input.title = body.title
      if (typeof body.priority === 'string' && isTaskPriority(body.priority)) {
        input.priority = body.priority
      }
      if (typeof body.context === 'string') input.context = body.context
      if (typeof body.requirements === 'string') input.requirements = body.requirements
      if (typeof body.constraints === 'string') input.constraints = body.constraints
      const updated = updateTask(currentId, input)
      currentId = updated.id
      if (!hasStatus) {
        return NextResponse.json(updated)
      }
    }

    if (typeof body.status !== 'string' || !isTaskColumn(body.status)) {
      return NextResponse.json({ error: 'status 必须是 todo/doing/done/blocked' }, { status: 400 })
    }
    return NextResponse.json(moveTask(currentId, body.status))
  } catch (error) {
    return taskErrorResponse(error)
  }
}
