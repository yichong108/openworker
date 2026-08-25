import { NextResponse } from 'next/server'

import { stopSkill } from '@/lib/skill-runner'
import { taskErrorResponse } from '@/lib/task-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 停止正在执行的 skill（Cursor SDK run.cancel）。
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { name?: unknown }
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: '缺少 skill 名' }, { status: 400 })
    }
    await stopSkill(body.name.trim())
    return NextResponse.json({ ok: true })
  } catch (error) {
    return taskErrorResponse(error)
  }
}
