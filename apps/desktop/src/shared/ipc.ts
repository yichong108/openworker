/** IPC 与共享类型（主进程 / 预加载 / 渲染层） */

export * from './ipc-shell.js'

export type {
  AgentComposerMode,
  AgentSendOptions,
  AppSettings,
  McpServerEntry,
  ModelProviderId,
  ProviderProfile,
  SettingsFormValues,
  ToolCallEvent,
  ToolErrorEvent,
  ToolTimelineEvent
} from '@openworker/shared'
export {
  applySettingsForm,
  defaultProviderProfiles,
  defaultSettings,
  getActiveProviderProfile,
  MAX_AGENT_LOOP_STEPS,
  MAX_MCP_SERVERS,
  mergeFormIntoProviderProfiles,
  normalizeComposerMode,
  normalizeSettings,
  parseMcpServersFromUnknown,
  settingsToFormValues
} from '@openworker/shared'

/** 固定 ID：用户主目录工作区；与 @openworker/shared 对齐 */
export { HOME_WORKSPACE_ID } from '@openworker/shared'
