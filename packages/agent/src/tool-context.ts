import type { WriteFileToolResult } from '@openworker/tools'

function isWriteFileToolResult(value: unknown): value is WriteFileToolResult {
  if (!value || typeof value !== 'object') return false
  const o = value as Record<string, unknown>
  return (
    typeof o.path === 'string' &&
    typeof o.before === 'string' &&
    typeof o.after === 'string' &&
    typeof o.created === 'boolean'
  )
}

/**
 * 将工具 execute 原始返回值映射为写入 message 上下文的 tool result。
 * 观测侧（onTool）仍保留 execute 原始结果；此处仅裁剪模型可见内容。
 *
 * @param toolName - 工具名
 * @param result - execute 返回值
 */
export function formatToolResultForContext(toolName: string, result: unknown): unknown {
  if (toolName === 'write_file' && isWriteFileToolResult(result)) {
    return `已写入：${result.path}`
  }
  return result
}
