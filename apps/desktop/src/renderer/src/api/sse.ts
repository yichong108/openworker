/**
 * 解析 POST SSE（text/event-stream）响应流
 */

import { getApiBaseUrl, getStoredAccessToken } from '@/renderer/src/api/request'

export type SseHandlers = {
  /** data 帧（无 event 名或默认） */
  onData?: (data: unknown) => void
  /** 带 event 名的帧 */
  onEvent?: (event: string, data: unknown) => void
  /** 连接结束（含 event: done） */
  onDone?: () => void
}

/**
 * 对 Native 发起 POST 并消费 SSE。
 *
 * @param path - 相对路径（如 `/sessions/x/agent/run`）
 * @param body - JSON body
 * @param handlers - 帧回调
 * @param signal - 可选 AbortSignal
 */
export async function postSse(
  path: string,
  body: unknown,
  handlers: SseHandlers,
  signal?: AbortSignal
): Promise<void> {
  const token = getStoredAccessToken()
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body ?? {}),
    signal
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `SSE 请求失败 (${res.status})`)
  }

  // 非 SSE：尝试解包 `{ code, message, data }` 或直接抛错
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('text/event-stream')) {
    const json = (await res.json().catch(() => null)) as {
      code?: number
      message?: string
      data?: unknown
    } | null
    if (json && typeof json.code === 'number' && json.code === 0) {
      handlers.onData?.(json.data)
      handlers.onDone?.()
      return
    }
    if (json && typeof json.message === 'string') {
      throw new Error(json.message)
    }
    throw new Error('期望 SSE 响应')
  }

  const reader = res.body?.getReader()
  if (!reader) {
    throw new Error('响应无正文')
  }

  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let eventName = ''
  let dataLines: string[] = []

  /**
   * 派发已凑齐的一帧
   */
  const flushFrame = () => {
    if (dataLines.length === 0 && !eventName) return
    const raw = dataLines.join('\n')
    dataLines = []
    const name = eventName
    eventName = ''
    if (name === 'done') {
      handlers.onDone?.()
      return
    }
    let parsed: unknown = raw
    try {
      parsed = JSON.parse(raw)
    } catch {
      // 保留原文
    }
    if (name) {
      handlers.onEvent?.(name, parsed)
    } else {
      handlers.onData?.(parsed)
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split(/\r?\n/)
    buffer = parts.pop() ?? ''
    for (const line of parts) {
      if (line === '') {
        flushFrame()
        continue
      }
      if (line.startsWith(':')) continue
      if (line.startsWith('event:')) {
        eventName = line.slice('event:'.length).trim()
        continue
      }
      if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trimStart())
      }
    }
  }
  flushFrame()
  handlers.onDone?.()
}
