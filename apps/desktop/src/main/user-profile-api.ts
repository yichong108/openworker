/**
 * 用户画像 API 客户端（main 进程，Bearer JWT）
 */

import type { PutUserProfileRequest, UserProfileDto } from '@openworker/shared'

import { getAccessToken } from '@/main/auth-token'
import { getApiBaseUrl } from '@/main/settings-api'

/** API envelope */
type ApiEnvelope<T> = {
  code: number
  message: string
  data: T | null
}

/**
 * 用户画像 API 调用失败
 */
export class UserProfileApiError extends Error {
  readonly code: number

  constructor(code: number, message: string) {
    super(message)
    this.name = 'UserProfileApiError'
    this.code = code
  }
}

/**
 * 带 JWT 调用 /me/profile
 *
 * @param method - HTTP 方法
 * @param path - 以 / 开头的路径
 * @param body - 可选 JSON body
 */
async function apiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getAccessToken()
  if (!token) {
    throw new UserProfileApiError(40102, 'Not authenticated')
  }

  const url = `${getApiBaseUrl()}${path}`
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  })

  let envelope: ApiEnvelope<T> | null = null
  try {
    envelope = (await res.json()) as ApiEnvelope<T>
  } catch {
    throw new UserProfileApiError(res.status, `${method} ${path}: invalid JSON (${res.status})`)
  }

  if (!envelope || envelope.code !== 0 || envelope.data == null) {
    throw new UserProfileApiError(
      envelope?.code ?? res.status,
      envelope?.message || `${method} ${path} failed`
    )
  }
  return envelope.data
}

/**
 * GET /me/profile
 *
 * @returns 当前用户画像
 */
export async function apiGetUserProfile(): Promise<UserProfileDto> {
  return apiRequest<UserProfileDto>('GET', '/me/profile')
}

/**
 * PUT /me/profile（整包覆盖）
 *
 * @param body - facts 列表
 * @returns 写入后的画像
 */
export async function apiPutUserProfile(body: PutUserProfileRequest): Promise<UserProfileDto> {
  return apiRequest<UserProfileDto>('PUT', '/me/profile', body)
}
