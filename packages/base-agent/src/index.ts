/**
 * @openworker/base-agent 公共 API — 最小 ReAct agent（仅 shell 工具）。
 */

export {
  createBaseAgent,
  type BaseAgent,
  type BaseAgentRunInput,
  type BaseAgentRunResult,
  type CreateBaseAgentLocalOptions,
  type CreateBaseAgentOptions
} from './createBaseAgent.js'

export {
  defineTool,
  filterToolSet,
  mergeToolSets,
  type ToolObservation,
  type ToolOnTool,
  type Tool,
  type ToolSet
} from '@openworker/tools'

export {
  assistantMessage,
  contentToText,
  findLastAiMessage,
  findLastAssistantMessage,
  userMessage,
  type CoreAssistantMessage,
  type CoreMessage,
  type CoreUserMessage
} from './messages.js'

export { runReactLoop, type FormatToolResultForContext } from './react-loop.js'

export { buildShellRunPrompt, buildShellTool, type BuildShellToolOptions } from '@openworker/tools'

export { ensureWorkspaceExists, resolveSafePath } from '@openworker/tools'

export {
  completeCommandInWorkspace,
  killCommand,
  runCommand,
  type RunCommandHandlers
} from '@openworker/tools'
