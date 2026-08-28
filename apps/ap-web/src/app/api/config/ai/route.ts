import { NextResponse } from 'next/server'

import { type AiConfigPatch, readAiConfig, toPublicAiConfig, writeAiConfig } from '@/ai/config'
import { taskErrorResponse } from '@/lib/task-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 读取 AI 配置（密钥仅返回掩码）。
 */
export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(toPublicAiConfig(readAiConfig()))
  } catch (error) {
    return taskErrorResponse(error)
  }
}

/**
 * 保存 DeepSeek 模型与密钥。
 */
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as AiConfigPatch
    const saved = writeAiConfig(body)
    return NextResponse.json(toPublicAiConfig(saved))
  } catch (error) {
    return taskErrorResponse(error)
  }
}
