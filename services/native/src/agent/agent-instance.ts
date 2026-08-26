/**
 * Native agent 工厂。
 *
 * 会话 / MCP host 一律经 OpenWorkerAgentAGUI。
 */

import { OpenWorkerAgentAGUI } from './openworker-agent-agui.js'
import type { Message } from '@ag-ui/client'

/** 会话级 AG-UI Agent */
export type SessionAguiAgent = OpenWorkerAgentAGUI

/**
 * 为单个会话创建独立 OpenWorkerAgentAGUI。
 *
 * @param options - cwd / messages / threadId
 * @returns 新的 OpenWorkerAgentAGUI
 */
export function createSessionAgent(options?: {
  cwd?: string
  messages?: Message[]
  threadId?: string
}): OpenWorkerAgentAGUI {
  const cwd = options?.cwd?.trim() || undefined

  return new OpenWorkerAgentAGUI({
    role: 'session',
    agentId: 'openworker-native',
    description: 'OpenWorker native session agent',
    cwd,
    ...(options?.threadId ? { threadId: options.threadId } : {}),
    ...(options?.messages ? { initialMessages: options.messages } : {})
  })
}

/** 应用级 MCP 宿主（warmup / probe / dispose），不用于会话 run */
let mcpHostAgent: OpenWorkerAgentAGUI | undefined

/**
 * 获取（或惰性创建）应用级 MCP 宿主。
 *
 * @returns role=mcp-host 的 OpenWorkerAgentAGUI
 */
export function getMcpHostAgent(): OpenWorkerAgentAGUI {
  if (!mcpHostAgent) {
    mcpHostAgent = new OpenWorkerAgentAGUI({
      role: 'mcp-host',
      agentId: 'openworker-mcp-host',
      description: 'OpenWorker native MCP host'
    })
  }
  return mcpHostAgent
}

/**
 * 设置变更后重建 MCP 宿主：先 dispose 再新建。
 *
 * @returns 重建后的 MCP 宿主
 */
export async function resetMcpHostAgent(): Promise<OpenWorkerAgentAGUI> {
  if (mcpHostAgent) {
    await mcpHostAgent.dispose()
  }
  mcpHostAgent = new OpenWorkerAgentAGUI({
    role: 'mcp-host',
    agentId: 'openworker-mcp-host',
    description: 'OpenWorker native MCP host'
  })
  return mcpHostAgent
}

/**
 * 释放 MCP 宿主（进程退出时调用）。
 */
export async function disposeMcpHostAgent(): Promise<void> {
  await getMcpHostAgent().dispose()
  mcpHostAgent = undefined
}
