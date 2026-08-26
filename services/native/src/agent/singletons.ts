/**
 * Native 进程级 Skills / MCP 单例。
 */

import { McpManager } from '@openworker/mcp'
import { SkillManager } from '@openworker/skills'

let skillManager: SkillManager | null = null
let mcpManager: McpManager | undefined

/**
 * 获取进程内 SkillManager 单例。
 *
 * @returns SkillManager 单例
 */
export function getSingleSkillManager(): SkillManager {
  skillManager ??= new SkillManager()
  return skillManager
}

/**
 * 释放 SkillManager 单例（测试 / 进程退出）。
 */
export function disposeSingleSkillManager(): void {
  skillManager?.dispose()
  skillManager = null
}

/**
 * 获取进程级 McpManager 单例。
 *
 * @returns 共享的 McpManager
 */
export function getDefaultMcpManager(): McpManager {
  mcpManager ??= new McpManager()
  return mcpManager
}
