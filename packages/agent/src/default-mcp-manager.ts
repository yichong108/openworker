/**
 * 进程级默认 McpManager — session send 与 mcp-host warmup/dispose 共用一池。
 *
 * 不从 @openworker/agent 包根导出；仅 createAgent 内部使用。
 */

import { McpManager } from '@openworker/mcp'

let instance: McpManager | undefined

/**
 * 获取（或惰性创建）进程级 MCP 管理器。
 *
 * @returns 共享的 McpManager 单例
 */
export function getDefaultMcpManager(): McpManager {
  instance ??= new McpManager()
  return instance
}
