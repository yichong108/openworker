import { Cursor } from '@cursor/sdk'
import { NextResponse } from 'next/server'

import { loadCursorEnv } from '@/lib/load-env'
import { taskErrorResponse } from '@/lib/task-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 查询 Cursor SDK 是否已登录。
 */
export async function GET(): Promise<NextResponse> {
  try {
    loadCursorEnv()
    const status = await Cursor.auth.status()
    return NextResponse.json({
      status: status.status,
      email: 'email' in status ? ((status as { email?: string }).email ?? null) : null
    })
  } catch (error) {
    return taskErrorResponse(error)
  }
}
