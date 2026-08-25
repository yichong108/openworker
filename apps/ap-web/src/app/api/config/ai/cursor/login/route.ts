import { Cursor } from '@cursor/sdk'
import { NextResponse } from 'next/server'

import { loadCursorEnv } from '@/lib/load-env'
import { taskErrorResponse } from '@/lib/task-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * 打开浏览器完成 Cursor SDK 登录。
 */
export async function POST(): Promise<NextResponse> {
  try {
    loadCursorEnv()
    const result = await Cursor.auth.login({
      apiKeyName: 'agent-weave ap-web'
    })
    return NextResponse.json({
      ok: true,
      email: result.email ?? null
    })
  } catch (error) {
    return taskErrorResponse(error)
  }
}
