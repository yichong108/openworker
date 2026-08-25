import { NextResponse } from 'next/server'

import { startSkill } from '@/lib/skill-runner'
import { taskErrorResponse } from '@/lib/task-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 启动指定 skill：用 Cursor SDK 本地 Agent 执行其 SKILL.md。
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { name?: unknown; input?: unknown }
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: '缺少 skill 名' }, { status: 400 })
    }
    const input = typeof body.input === 'string' ? body.input : undefined
    await startSkill(body.name.trim(), input)
    return NextResponse.json({ ok: true }, { status: 202 })
  } catch (error) {
    return taskErrorResponse(error)
  }
}
