/**
 * @openworker/agent 公共 API — 通用产品能力 agent（createAgent）。
 *
 * 不含 MCP、不含 AG-UI；产品约定与事件流由宿主装配。
 */

export {
  createAgent,
  type Agent,
  type AgentCapabilities,
  type AgentRunInput,
  type AgentRunResult,
  type AgentRunTavilyOptions,
  type CreateAgentOptions,
  type ResolveAgentCapabilities,
  type ResolveAgentCapabilitiesContext
} from './create-agent.js'

export {
  defineTool,
  filterToolSet,
  mergeToolSets,
  type ToolObservation,
  type ToolOnTool
} from '@openworker/tools'

export {
  assistantMessage,
  contentToText,
  findLastAiMessage,
  findLastAssistantMessage,
  userMessage
} from '@openworker/base-agent'

/** 工作区工具组装 */
export {
  buildWorkspaceTools,
  isReadonlyComposerMode,
  type BuildWorkspaceToolsOptions
} from './workspace-tools.js'

/** 工作区 ReAct system prompt */
export { buildWorkspaceRunPrompt, type WorkspacePromptExtras } from './build-prompt.js'

/** Plan 工件解析 */
export {
  OPENWORKER_PLAN_CUSTOM_NAME,
  OPENWORKER_PLAN_FENCE_LANG,
  buildApprovedPlanSystemSection,
  extractPlanTitle,
  parsePlanArtifact,
  type ParsedPlanArtifact
} from './plan-artifact.js'

/** 路径安全（宿主 workspace 文件 API 可复用） */
export { ensureWorkspaceExists, resolveSafePath } from '@openworker/tools'

/** 终端进程控制（宿主交互式终端用；agent shell 不经过此类） */
export { TerminalManager, type RunCommandHandlers } from '@openworker/tools'
