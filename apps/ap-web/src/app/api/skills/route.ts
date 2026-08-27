import { NextResponse } from 'next/server'

import { listAgentsSkills } from '@/lib/skills-fs'
import { taskErrorResponse } from '@/lib/task-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 列出 `.agents/ap-config/skills` 与 `.agents/skills` 下全部 skill 的名称与描述。
 */
export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ skills: listAgentsSkills() })
  } catch (error) {
    return taskErrorResponse(error)
  }
}
