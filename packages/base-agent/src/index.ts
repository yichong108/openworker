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
} from './define-tool.js'

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

export { runReactLoop } from './react-loop.js'

export {
  buildShellRunPrompt,
  buildShellTool,
  type BuildShellToolOptions
} from './tools/shell-tool.js'

export { ensureWorkspaceExists, resolveSafePath } from './tools/path-guard.js'

export {
  completeCommandInWorkspace,
  killCommand,
  runCommand,
  type RunCommandHandlers
} from './tools/terminal.js'
