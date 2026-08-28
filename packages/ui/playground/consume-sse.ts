/**
 * 消费 SSE：每条 `data:` 回调一次（BaseAgentWithAGUI 的 BaseEvent）。
 *
 * @param response - fetch 响应
 * @param onEvent - 事件回调
 * @param signal - 取消
 */
export async function consumeSse(
  response: Response,
  onEvent: (event: unknown) => void,
  signal: AbortSignal
): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('响应没有可读流')
  const decoder = new TextDecoder()
  let buf = ''
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
      onEvent(JSON.parse(data) as unknown)
    }
  }
}
