import { NextResponse } from 'next/server'

import { listSkillRunSnapshot } from '@/lib/skill-run-state'
import { taskErrorResponse } from '@/lib/task-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 返回当前正在通过 Cursor SDK 执行的 skill 名。
 */
export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(listSkillRunSnapshot())
  } catch (error) {
    return taskErrorResponse(error)
  }
}
