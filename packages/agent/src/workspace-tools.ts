import { type AgentComposerMode } from '@openworker/shared'
import type { ToolSet } from 'ai'
import {
  buildFsTools,
  buildGrepTool,
  buildShellTool,
  buildWebSearchTool,
  filterToolSet,
  mergeToolSets,
  type ToolOnTool
} from '@openworker/tools'

/** Ask / Plan 模式允许的只读工具名 */
const READONLY_MODE_ALLOWED_TOOL_NAMES = new Set(['read_file', 'glob', 'grep', 'web_search'])

/**
 * 判断 composer 模式是否为只读（ask / plan）。
 *
 * @param mode - 发送模式
 * @returns 是否只读
 */
export function isReadonlyComposerMode(mode?: AgentComposerMode): boolean {
  return mode === 'ask' || mode === 'plan'
}

/**
 * 组装工作区基础工具（fs / grep / shell / 可选 web_search）的选项。
 */
export type BuildWorkspaceToolsOptions = {
  root: string
  /** Tavily API Key；未配置时不注册 web_search */
  tavilyApiKey?: string
  /** 工具生命周期观察回调 */
  onTool: ToolOnTool
  /**
   * ask / plan：仅只读工具；build（默认）：含写文件与 shell。
   * 未传则返回完整工具集。
   */
  mode?: AgentComposerMode
}

/**
 * 构建工作区内置工具列表。
 *
 * 这是 agent 内建能力：读写文件、搜索、shell、可选联网搜索。
 *
 * @param options - 工作区、Tavily 与观察回调
 * @returns AI SDK ToolSet
 */
export function buildWorkspaceTools(options: BuildWorkspaceToolsOptions): ToolSet {
  const { root, tavilyApiKey, onTool, mode } = options

  const tools = mergeToolSets(
    buildFsTools({ root, onTool }),
    buildGrepTool({ root, onTool }),
    buildShellTool({ root, onTool }),
    buildWebSearchTool({ tavilyApiKey, onTool })
  )

  if (isReadonlyComposerMode(mode)) {
    return filterToolSet(tools, (name) => READONLY_MODE_ALLOWED_TOOL_NAMES.has(name))
  }
  return tools
}
