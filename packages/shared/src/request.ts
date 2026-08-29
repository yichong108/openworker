import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios'

export type { AxiosRequestConfig }

/**
 * 从 axios 错误里取出接口响应体。
 *
 * @param error - 捕获的异常
 * @returns 响应 JSON，无法解析时为 undefined
 */
export function getRequestErrorPayload(error: unknown): unknown {
  if (axios.isAxiosError(error)) {
    return error.response?.data
  }
  return undefined
}

/**
 * 从 axios 错误里取出 HTTP 状态码。
 *
 * @param error - 捕获的异常
 * @returns 状态码，无法解析时为 undefined
 */
export function getRequestErrorStatus(error: unknown): number | undefined {
  if (axios.isAxiosError(error)) {
    return error.response?.status
  }
  return undefined
}

const client = axios.create({
  headers: {
    'Content-Type': 'application/json'
  }
})

/**
 * 发起 http API 请求。
 */
export function request(config: AxiosRequestConfig): Promise<AxiosResponse<unknown>> {
  return client.request(config)
}
