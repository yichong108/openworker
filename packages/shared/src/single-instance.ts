/**
 * 进程内共享单例。
 *
 * 类定义留在各自包内；此处只持有实例，避免宿主与工具各 `new` 一份。
 * 不从 `@openworker/shared` 桶文件再导出：Desktop 主进程会 alias 该桶，
 * 若此处拉取 `@openworker/tools` 会把 ripgrep 打进 Electron 并在启动时崩溃。
 */

import { TerminalManager } from '@openworker/tools/terminal-manager'

export { TerminalManager, type RunCommandHandlers } from '@openworker/tools/terminal-manager'

/**
 * 进程内默认终端管理器。
 *
 * shell 工具与宿主取消/右侧终端必须共用此实例，才能按 sessionKey 互斥与杀进程。
 */
export const terminalManager = new TerminalManager()
