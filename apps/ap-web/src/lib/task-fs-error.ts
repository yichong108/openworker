/**
 * 任务文件读写错误，携带 HTTP 状态码供 Route Handler 使用。
 */
export class TaskFsError extends Error {
  readonly statusCode: number
  readonly code?: string

  /**
   * @param message - 可展示给前端的原因
   * @param statusCode - HTTP 状态码
   * @param code - 可选业务码，如 ai_auth
   */
  constructor(message: string, statusCode: number, code?: string) {
    super(message)
    this.name = 'TaskFsError'
    this.statusCode = statusCode
    this.code = code
  }
}
