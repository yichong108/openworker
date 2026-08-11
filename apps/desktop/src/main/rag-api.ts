/**
 * 知识库 RAG API 客户端（main 进程）
 *
 * Desktop 在发消息前预取检索片段，注入 system 上下文；不经 agent 工具调用。
 */

import type { RagQueryRequest, RagQueryResponse } from '@openworker/shared'

import { getAccessToken } from '@/main/auth-token'
import { getApiBaseUrl } from '@/main/settings-api'

/** API envelope */
type ApiEnvelope<T> = {
  code: number
  message: string
  data: T | null
}

/**
 * RAG API 调用失败
 */
export class RagApiError extends Error {
  readonly code: number

  constructor(code: number, message: string) {
    super(message)
    this.name = 'RagApiError'
    this.code = code
  }
}

/**
 * 调用 OpenWorker API 的 JSON 接口
 *
 * @param method - HTTP 方法
 * @param path - 以 / 开头的路径
 * @param body - 可选 JSON body
 */
async function apiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${getApiBaseUrl()}${path}`
  const headers: Record<string, string> = {
    Accept: 'application/json'
  }
  const token = getAccessToken()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60_000)
  })

  let envelope: ApiEnvelope<T> | null = null
  try {
    envelope = (await res.json()) as ApiEnvelope<T>
  } catch {
    throw new RagApiError(res.status, `${method} ${path}: invalid JSON (${res.status})`)
  }

  if (!envelope || envelope.code !== 0 || envelope.data == null) {
    throw new RagApiError(
      envelope?.code ?? res.status,
      envelope?.message || `${method} ${path} failed`
    )
  }
  return envelope.data
}

/**
 * POST /rag/query
 *
 * @param body - 查询参数
 * @returns 命中片段与可选回答
 */
export async function apiQueryRag(body: RagQueryRequest): Promise<RagQueryResponse> {
  return apiRequest<RagQueryResponse>('POST', '/rag/query', body)
}
