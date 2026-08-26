import { NextResponse } from 'next/server'

import { listAiModels } from '@/lib/ai-models'
import { taskErrorResponse } from '@/lib/task-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 拉取 DeepSeek 模型列表；鉴权失败仍返回默认模型并带 authError。
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { apiKey?: unknown }
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey : undefined
    const result = await listAiModels(apiKey)
    return NextResponse.json(result)
  } catch (error) {
    return taskErrorResponse(error)
  }
}
