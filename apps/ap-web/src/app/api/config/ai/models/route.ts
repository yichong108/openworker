import { NextResponse } from 'next/server'

import { isAiProvider } from '@/lib/ai-config'
import { listAiModels } from '@/lib/ai-models'
import { taskErrorResponse } from '@/lib/task-api'
import { TaskFsError } from '@/lib/task-fs-error'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 拉取指定提供方的最新模型列表；鉴权失败仍返回默认模型并带 authError。
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { provider?: unknown; apiKey?: unknown }
    if (typeof body.provider !== 'string' || !isAiProvider(body.provider)) {
      throw new TaskFsError('provider 必须是 cursor 或 deepseek', 400)
    }
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey : undefined
    const result = await listAiModels(body.provider, apiKey)
    return NextResponse.json(result)
  } catch (error) {
    return taskErrorResponse(error)
  }
}
