/**
 * 任务文件读写错误，携带 HTTP 状态码供 Route Handler 使用。
 */
export class TaskFsError extends Error {
  readonly statusCode: number

  /**
   * @param message - 可展示给前端的原因
   * @param statusCode - HTTP 状态码
   */
  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'TaskFsError'
    this.statusCode = statusCode
  }
}
