import type { ToolSet } from 'ai'
import { z } from 'zod'

import { defineTool, type ToolOnTool } from '../define-tool.js'
import { runWorkspaceCommandOnce } from '../workspace-shell.js'

/**
 * 组装 shell 工具的选项。
 */
export type BuildShellToolOptions = {
  /** 工作区根目录 */
  root: string
  /** 工具生命周期观察回调 */
  onTool: ToolOnTool
}

/**
 * 构建仅含 shell 工具的 ToolSet。
 *
 * 每次 execute 独立 spawn，不经过 TerminalManager；取消靠 abortSignal 杀本子进程。
 *
 * @param options - 工作区与观察回调
 * @returns 仅含 shell 一项的 ToolSet
 */
export function buildShellTool(options: BuildShellToolOptions): ToolSet {
  const { root, onTool } = options

  return defineTool(
    {
      id: 'shell',
      description: `默认在目录${root}执行一条 shell 命令，阻塞直到进程结束，返回合并后的 stdout/stderr。你可以指定其他目录。
用法：
- 适合一次性命令：安装依赖、构建、测试、git、包管理器、格式化等。
- 不要用本工具长期挂起（dev server、watch、REPL）；这类进程会一直等到结束或被取消。`,
      parameters: z.object({ command: z.string() }),
      execute: ({ command }, execOptions) =>
        runWorkspaceCommandOnce(root, command, execOptions.abortSignal)
    },
    onTool
  )
}
