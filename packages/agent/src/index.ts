/**
 * @openworker/agent 公共 API — 宿主入口为 AgentWithAGUI（AG-UI），勿直接使用 createAgent。
 *
 * createAgent 为包内实现细节，仅由 AgentWithAGUI 委托；外部应经 AG-UI runAgent / 事件流交互。
 * MCP 宿主能力经 AgentWithAGUI.mcp（probe / warmup / dispose）。
 */

/** AG-UI AbstractAgent 适配（宿主唯一对话入口） */
export {
  AgentWithAGUI,
  aguiMessagesToCore,
  coreMessagesToAgui,
  extractUserTurn,
  type CreateAgentWithAGUIOptions,
  type AgentWithAGUIRunDefaults
} from './agent-with-agui.js'

export {
  type AgentMcp,
  type AgentRunResult,
  type AgentRunTavilyOptions,
  type CreateAgentLocalOptions,
  type CreateAgentOptions
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

export { disposeSingleSkillManager, getSingleSkillManager } from './single-skill-manager.js'

export {
  getDefaultGlobalAgentsSkillsDir,
  listSkillsFromPaths,
  loadSkillsFromPaths,
  parseSkillFrontmatter,
  sanitizeSkillToolName,
  SkillManager,
  type LoadedSkillsBundle,
  type ManagedSkill,
  type SkillListItem,
  type SkillRootDirs,
  type SkillWatchEvent
} from '@openworker/skills'

/** 工作区工具组装与 ReAct system prompt */
export {
  buildWorkspaceRunPrompt,
  buildWorkspaceTools,
  isReadonlyComposerMode,
  type BuildWorkspaceToolsOptions,
  type WorkspacePromptExtras
} from './workspace-tools.js'

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
