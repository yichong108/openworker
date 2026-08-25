import { NextResponse } from 'next/server'

import { taskErrorResponse } from '@/lib/task-api'
import { parseToolboxPutBody, readToolboxItems, writeToolboxItems } from '@/lib/toolbox-fs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 读取已添加工具记录。
 */
export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ items: readToolboxItems() })
  } catch (error) {
    return taskErrorResponse(error)
  }
}

/**
 * 覆盖写入已添加工具记录。
 */
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const body: unknown = await request.json()
    const items = parseToolboxPutBody(body)
    writeToolboxItems(items)
    return NextResponse.json({ items })
  } catch (error) {
    return taskErrorResponse(error)
  }
}
