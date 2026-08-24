/**
 * @openworker/uni-agent 公共 API。
 *
 * 宿主 AG-UI 入口为 `UniAgent` 类与简单问答 `ask`；内部委托 OpenWorker 后端。
 */

export {
  UniAgent,
  type UniAgentConfig,
  type UniAgentRunDefaults,
  type UniAgentRunInput
} from './uni-agent.js'

export { ask, type AskOptions } from './ask.js'

/** 宿主工具转发（避免 Desktop 直依 agent） */
export { type AgentMcp } from '@openworker/agent'

/** LLM 工厂（避免 Desktop 直依 agent） */
export { getChatModel, type OpenAiChatModelOptions } from '@openworker/llm'

export {
  getDefaultGlobalAgentsSkillsDir,
  listSkillsFromPaths,
  loadSkillsFromPaths,
  parseSkillFrontmatter,
  sanitizeSkillToolName,
  type LoadedSkillsBundle,
  type SkillListItem
} from '@openworker/skills'

export { ensureWorkspaceExists, resolveSafePath } from '@openworker/agent'

export { killCommand, runCommand, type RunCommandHandlers } from '@openworker/agent'
