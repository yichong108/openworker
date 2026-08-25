/** 与 packages 内 `setLogger` 注入兼容的最小 Logger 接口 */
export type Logger = {
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

export type LogContext = {
  sessionId?: string
  workspaceId?: string
  requestId?: string
}

export type RootLoggerOptions = {
  /** dev 控制台 pretty；pipe 模式建议 false */
  console?: boolean
  /** 落盘绝对路径；pipe 模式为 null */
  file?: string | null
  /** 仅 stdout JSON（Desktop spawn pipe） */
  stdoutJson?: boolean
}
