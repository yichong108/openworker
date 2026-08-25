import {
  tool,
  type FlexibleSchema,
  type InferSchema,
  type Tool,
  type ToolExecutionOptions,
  type ToolSet
} from 'ai'
import { toolsLog } from './logger.js'

const TOOL_LOG_TRUNCATE = 2048

function truncateForLog(value: unknown): unknown {
  const str = typeof value === 'string' ? value : JSON.stringify(value)
  if (str.length <= TOOL_LOG_TRUNCATE) return value
  return `${str.slice(0, TOOL_LOG_TRUNCATE)}…(${str.length} chars)`
}

/**
 * 工具执行生命周期观察（start / end）。
 *
 * 供宿主映射为产品侧时间线（如 ToolTimelineEvent）；tools 包本身不依赖 UI/IPC 类型。
 * runId / traceId 由宿主在 onTool 回调中自行附加，不在此结构中携带。
 */
export type ToolObservation = {
  id: string
  toolCallId: string
  status: 'start' | 'end'
  args?: string
  result?: string
  timestampMs?: number
}

/**
 * 工具生命周期观察回调。
 *
 * AI SDK 的 ToolExecutionOptions 不含 onTool，故由宿主/工作流注入。
 * 会话与追踪 ID 由宿主在回调外维护，不注入本回调参数。
 */
export type ToolOnTool = (e: ToolObservation) => void

type ToolDefinition<T extends FlexibleSchema> = {
  id: string
  description?: string
  /** 对外仍使用 parameters；内部映射为 SDK inputSchema（Zod 或 jsonSchema） */
  parameters: T
  execute?: (
    input: InferSchema<T>,
    options: ToolExecutionOptions<unknown>
  ) => unknown | Promise<unknown>
}

/**
 * 将工具参数规范为 JSON 字符串，供时间线解析（如 path / content）。
 *
 * @param parsed - 入参
 * @returns JSON 字符串；无法序列化时退回 String
 */
function toolArgsToObservation(parsed: unknown): string {
  try {
    return JSON.stringify(parsed ?? {})
  } catch {
    return String(parsed)
  }
}

/**
 * 将工具执行结果规范为观察用字符串（string 原样，其它 JSON.stringify）。
 *
 * @param result - execute 返回值
 */
function toolResultToObservation(result: unknown): string {
  if (typeof result === 'string') return result
  try {
    return JSON.stringify(result)
  } catch {
    return String(result)
  }
}

/**
 * 合并多个 AI SDK ToolSet（同名后者覆盖前者）。
 *
 * @param sets - 待合并的 ToolSet
 * @returns 合并后的 ToolSet
 */
export function mergeToolSets(...sets: ToolSet[]): ToolSet {
  return Object.assign({}, ...sets) as ToolSet
}

/**
 * 按工具名过滤 ToolSet。
 *
 * @param tools - 原始 ToolSet
 * @param predicate - 保留条件（参数为工具名）
 * @returns 过滤后的 ToolSet
 */
export function filterToolSet(tools: ToolSet, predicate: (name: string) => boolean): ToolSet {
  const out: ToolSet = {}
  for (const [name, t] of Object.entries(tools)) {
    if (predicate(name)) out[name] = t
  }
  return out
}

/**
 * 将工具定义包装为单键 AI SDK ToolSet（含生命周期观察上报）。
 *
 * 返回 ToolSet 而非自定义结构，可直接传给 streamText / generateText，
 * 或多个结果经 mergeToolSets 合并。
 *
 * @param def - 工具定义（name、parameters、execute）
 * @param onTool - 工具生命周期观察回调
 * @returns 仅含该工具一项的 ToolSet
 */
export function defineTool<T extends FlexibleSchema>(
  def: ToolDefinition<T>,
  onTool: ToolOnTool
): ToolSet {
  const { id, description, parameters, execute } = def

  const wrapped: Tool = tool({
    description,
    inputSchema: parameters,
    execute: async (input, options) => {
      const parsed = input as InferSchema<T>
      const startedAt = Date.now()
      const args = toolArgsToObservation(parsed)

      onTool({
        id,
        toolCallId: options.toolCallId,
        status: 'start',
        args,
        timestampMs: startedAt
      })

      toolsLog.info('execute tool start', { id })
      toolsLog.debug('execute tool start detail', { id, args: truncateForLog(args) })

      const result = await execute?.(parsed, options)
      const resultStr = toolResultToObservation(result)
      const durationMs = Date.now() - startedAt

      onTool({
        id,
        toolCallId: options.toolCallId,
        status: 'end',
        result: resultStr,
        timestampMs: Date.now()
      })

      toolsLog.info('execute tool end', { id, durationMs })
      toolsLog.debug('execute tool end detail', { id, result: truncateForLog(resultStr) })

      return result
    }
  })

  return { [id]: wrapped }
}

export type { Tool, ToolSet }
