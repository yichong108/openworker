/**
 * @openworker/tools 公共 API — defineTool、工作区工具、path-guard、terminal。
 */

export {
  defineTool,
  filterToolSet,
  mergeToolSets,
  type ToolObservation,
  type ToolOnTool,
  type Tool,
  type ToolSet
} from './define-tool.js'

export { buildShellRunPrompt, buildShellTool, type BuildShellToolOptions } from './shell-tool.js'

export { ensureWorkspaceExists, resolveSafePath } from './path-guard.js'

export {
  completeCommandInWorkspace,
  isRunning,
  killCommand,
  runCommand,
  type RunCommandHandlers
} from './terminal.js'

export {
  buildFsTools,
  deleteFileTool,
  globFilesTool,
  listDirTool,
  readFileTool,
  writeFileTool,
  type BuildFsToolsOptions,
  type WriteFileToolResult
} from './fs-tools.js'

export {
  buildGrepTool,
  GREP_MAX_OUTPUT_LINES,
  GREP_TOOL_DESCRIPTION,
  grepWorkspace,
  type BuildGrepToolOptions,
  type GrepToolArgs
} from './grep.js'

export {
  buildWebSearchTool,
  isTavilyConfigured,
  tavilyWebSearch,
  type BuildWebSearchToolOptions
} from './web-search.js'

export {
  buildWorkspaceRunPrompt,
  buildWorkspaceTools,
  isReadonlyComposerMode,
  type BuildWorkspaceToolsOptions,
  type WorkspacePromptExtras
} from './workspace-tools.js'
