import axios, { type AxiosRequestConfig } from 'axios'

const API_SUCCESS_CODE = 0

/** 渲染进程数据面 / Agent 默认打 Native（与主进程 getNativeBaseUrl 一致） */
const API_URL =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_OPENWORKER_NATIVE_BASE_URL ||
  'http://127.0.0.1:3200'

/** localStorage 中持久化登录会话的 key（与 auth-store 一致） */
const AUTH_STORAGE_KEY = 'openworker.auth.session'

interface ApiEnvelope<T> {
  code: number
  message: string
  data: T | null
}

function isApiEnvelope(value: unknown): value is ApiEnvelope<unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    'code' in value &&
    typeof value.code === 'number' &&
    'message' in value &&
    typeof value.message === 'string' &&
    'data' in value
  )
}

export type RequestFailure =
  | {
      ok: false
      kind: 'network'
    }
  | {
      ok: false
      kind: 'business'
      code: number
      message: string
    }

export type RequestResult<T> =
  | {
      ok: true
      data: T
    }
  | RequestFailure

const client = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
})

/**
 * 返回 Native / API 基址（供 SSE fetch 使用）。
 *
 * @returns 基址 URL（无尾斜杠语义由调用方拼接）
 */
export function getApiBaseUrl(): string {
  return API_URL.replace(/\/$/, '')
}

/**
 * 从 localStorage 读取当前 JWT（避免 request ↔ auth-store 循环依赖）。
 *
 * @returns accessToken 或 null
 */
export function getStoredAccessToken(): string | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { accessToken?: unknown }
    return typeof parsed.accessToken === 'string' && parsed.accessToken ? parsed.accessToken : null
  } catch {
    return null
  }
}

client.interceptors.request.use((config) => {
  const token = getStoredAccessToken()
  if (token) {
    config.headers = config.headers ?? {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/**
 * 将失败结果转为可展示的错误文案。
 *
 * @param result - ``ok: false`` 的请求结果
 * @returns 面向用户的错误描述
 */
export function getRequestErrorMessage(result: RequestFailure): string {
  if (result.kind === 'business') {
    return result.message
  }

  return '网络异常，请稍后重试'
}

type RequestConfig = AxiosRequestConfig

/**
 * 发起 API 请求并解包统一 envelope 响应。
 *
 * @typeParam T - 业务 data 类型
 * @param config - axios 请求配置
 * @returns 解包后的请求结果
 */
export function request<T>(config: RequestConfig): Promise<RequestResult<T>> {
  return client
    .request(config)
    .then((response): RequestResult<T> => {
      if (!isApiEnvelope(response.data)) {
        console.error('请求出错了，接口返回数据不符合结构', response.data)
        return { ok: false, kind: 'network' }
      }

      const envelope = response.data as ApiEnvelope<T>

      if (response.status === 200 && envelope.code === API_SUCCESS_CODE) {
        return { ok: true, data: envelope.data as T }
      }

      if (response.status === 200) {
        return {
          ok: false,
          kind: 'business',
          code: envelope.code,
          message: envelope.message
        }
      }

      return { ok: false, kind: 'network' }
    })
    .catch((error) => {
      console.error('请求出错了', error)
      return { ok: false, kind: 'network' }
    })
}

/**
 * 发起请求并解包 `{ data: T }` 形态（settings 等非 code envelope）。
 *
 * @typeParam T - 业务 data 类型
 * @param config - axios 请求配置
 * @returns 解包后的请求结果
 */
export function requestDataEnvelope<T>(config: RequestConfig): Promise<RequestResult<T>> {
  return client
    .request(config)
    .then((response): RequestResult<T> => {
      const body = response.data
      if (
        response.status === 200 &&
        body &&
        typeof body === 'object' &&
        'data' in body &&
        (body as { data: unknown }).data !== undefined
      ) {
        return { ok: true, data: (body as { data: T }).data }
      }
      const message =
        body && typeof body === 'object' && 'message' in body
          ? String((body as { message: unknown }).message)
          : '请求失败'
      return { ok: false, kind: 'business', code: response.status, message }
    })
    .catch((error) => {
      console.error('请求出错了', error)
      return { ok: false, kind: 'network' }
    })
}
