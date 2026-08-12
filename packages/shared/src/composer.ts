/**
 * 主输入区发送模式（对齐 Cursor）：
 * - build：可写文件、终端、技能/MCP
 * - ask：只读问答
 * - plan：只读调研并产出可审阅计划；写码需用户批准后另开 build run
 */
export type AgentComposerMode = 'build' | 'ask' | 'plan'

/**
 * 规范化 composer mode，非法值回退为 build。
 *
 * @param mode - 可选模式
 * @returns build / ask / plan
 */
export function normalizeComposerMode(mode?: AgentComposerMode): AgentComposerMode {
  if (mode === 'ask' || mode === 'plan') return mode
  return 'build'
}

/**
 * 发送智能体消息时的可选参数（IPC / 宿主 send 共用）。
 */
export type AgentSendOptions = {
  mode?: AgentComposerMode
  /** 本轮工作区根目录绝对路径；宿主可据此覆盖会话默认路径 */
  workspacePath?: string
  /**
   * 重新编辑：按「第几个用户消息」（0-based）截断 AG-UI 历史后，用本次 text 替换该条并重跑。
   * 未设置时按普通追加发送。
   */
  editUserOrdinal?: number
  /**
   * 已批准的实施计划 Markdown（Build 执行阶段注入）。
   * 通常来自 Plan 模式产出并经用户编辑确认。
   */
  planMarkdown?: string
}
