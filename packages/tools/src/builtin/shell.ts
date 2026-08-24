import { MAX_TERMINAL_OUTPUT_CHARS } from '@openworker/shared'
import type { ToolSet } from 'ai'
import { z } from 'zod'

import { defineTool, type ToolOnTool } from '../define-tool.js'
import { runCommand } from '../terminal-manager.js'

/**
 * 组装 shell 工具的选项。
 */
export type BuildShellToolOptions = {
  /** Shell 命令隔离键（由宿主提供） */
  terminalKey: string
  /** 工作区根目录 */
  root: string
  /** 工具生命周期观察回调 */
  onTool: ToolOnTool
}

/**
 * 构建仅含 shell 工具的 ToolSet。
 *
 * @param options - 终端键、工作区与观察回调
 * @returns 仅含 shell 一项的 ToolSet
 */
export function buildShellTool(options: BuildShellToolOptions): ToolSet {
  const { terminalKey, root, onTool } = options
  const termKey = terminalKey.trim() || 'term:default'

  return defineTool(
    {
      id: 'shell',
      description:
        '在工作区根目录执行 shell 命令并等待结束，返回合并的 stdout/stderr（过长会截断）。用于安装依赖、构建、测试、git 等。',
      parameters: z.object({ command: z.string() }),
      execute: ({ command }) => runCommand(termKey, root, command, MAX_TERMINAL_OUTPUT_CHARS)
    },
    onTool
  )
}

/**
 * 构建 base agent 的极简 system prompt。
 *
 * @param root - 工作区根目录
 * @returns system prompt 文本
 */
export function buildShellRunPrompt(root: string): string {
  return `You are a helpful assistant. The workspace root is: ${root}

You have access to the shell tool to run commands in this workspace. Use it when you need to install dependencies, build, test, or inspect the project via the command line.`
}
