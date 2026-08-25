import { NextResponse } from 'next/server'

import { TaskFsError } from '@/lib/task-fs-error'

/**
 * 把任务读写错误转成 JSON 响应；未知错误记为 500。
 *
 * @param error - 捕获的异常
 * @returns NextResponse
 */
export function taskErrorResponse(error: unknown): NextResponse {
  if (error instanceof TaskFsError) {
    return NextResponse.json(
      { error: error.message, ...(error.code ? { code: error.code } : {}) },
      { status: error.statusCode }
    )
  }
  const message = error instanceof Error ? error.message : '服务器错误'
  return NextResponse.json({ error: message }, { status: 500 })
}

/**
 * 从 catch-all 路由参数拼回任务 id。
 *
 * @param id - 路径段
 * @returns POSIX 相对路径
 */
export function taskIdFromParams(id: string[] | undefined): string {
  if (!id || id.length === 0) {
    throw new TaskFsError('缺少任务 id', 400)
  }
  return id.map((segment) => decodeURIComponent(segment)).join('/')
}
