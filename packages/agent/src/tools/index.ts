/**
 * Agent 内建工作区工具（包内模块）。
 *
 * 公共 API 见 `@openworker/agent` 根导出；勿在此 barrel 再导出实现细节。
 */

export { ensureWorkspaceExists, resolveSafePath } from '@openworker/base-agent'

export {
  completeCommandInWorkspace,
  killCommand,
  runCommand,
  type RunCommandHandlers
} from '@openworker/base-agent'

export {
  buildWorkspaceRunPrompt,
  buildWorkspaceTools,
  type BuildWorkspaceToolsOptions,
  type WorkspacePromptExtras
} from './workspace-tools.js'
