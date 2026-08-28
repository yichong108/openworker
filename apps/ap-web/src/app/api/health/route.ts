import { NextResponse } from 'next/server'

import { getApWebLaunchDir } from '@/ai/agents-root'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 轻量探活；返回 launchDir 供 ap view 识别多实例归属。
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    ok: true,
    launchDir: getApWebLaunchDir()
  })
}
