import type { ToolSet } from 'ai'
import type { ToolObservation, ToolOnTool, WriteFileToolResult } from '@openworker/tools'

/** 观测侧 tool result 字符串长度上限（按工具名；未列出则不截断） */
const TOOL_OBSERVATION_RESULT_LIMITS: Record<string, number> = {
  read_file: 1_000,
  glob: 12_000,
  grep: 12_000,
  shell: 4_000,
  web_search: 12_000
}

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
 * 截断 onTool 观测侧 result 字符串，避免 IPC/时间线膨胀。
 *
 * @param toolName - 工具名
 * @param result - 观测 result 字符串
 */
export function truncateToolObservationResult(toolName: string, result: string): string {
  const limit = TOOL_OBSERVATION_RESULT_LIMITS[toolName]
  if (limit == null || result.length <= limit) return result
  return result.slice(0, limit)
}

/**
 * 包装 onTool：在 end 事件上报前按工具名截断 result。
 *
 * @param onTool - 宿主原始回调
 */
export function wrapToolOnTool(onTool: ToolOnTool): ToolOnTool {
  return (observation: ToolObservation) => {
    if (observation.status !== 'end' || observation.result == null) {
      onTool(observation)
      return
    }
    onTool({
      ...observation,
      result: truncateToolObservationResult(observation.id, observation.result)
    })
  }
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

/**
 * 包装 ToolSet 的 execute：先跑原实现（onTool 仍看到原始结果），再裁剪模型上下文。
 *
 * 用于在不给 createBaseAgent 增加字段的前提下，保持 formatToolResultForContext 语义。
 *
 * @param tools - 已合并的本轮工具
 * @returns execute 返回值已经过 formatToolResultForContext 的 ToolSet
 */
export function wrapToolExecuteForContext(tools: ToolSet): ToolSet {
  const out: ToolSet = {}
  for (const [name, t] of Object.entries(tools)) {
    if (!t?.execute) {
      out[name] = t
      continue
    }
    const originalExecute = t.execute.bind(t)
    out[name] = {
      ...t,
      execute: async (input, options) => {
        const raw = await originalExecute(input, options)
        return formatToolResultForContext(name, raw)
      }
    }
  }
  return out
}
