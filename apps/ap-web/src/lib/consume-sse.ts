/**
 * 消费 SSE：每条 `data:` 回调一次。
 *
 * @param response - fetch 响应
 * @param onEvent - 事件回调
 * @param signal - 取消
 */
export async function consumeSse<T = unknown>(
  response: Response,
  onEvent: (event: T) => void,
  signal: AbortSignal
): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('响应没有可读流')
  const decoder = new TextDecoder()
  let buf = ''
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const blocks = buf.split('\n\n')
      buf = blocks.pop() ?? ''
      for (const block of blocks) {
        const dataLine = block.split('\n').find((line) => line.startsWith('data:'))
        if (!dataLine) continue
        const data = dataLine.slice(5).trim()
        if (!data || data === '{}') continue
        onEvent(JSON.parse(data) as T)
      }
    }
  } finally {
    try {
      await reader.cancel()
    } catch {
      /* already closed */
    }
  }
}
