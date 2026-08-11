/**
 * Desktop agent 工厂。
 *
 * 把工作区 / 会话上下文传给 UniAgent。
 */
import { UniAgent } from '@openworker/uni-agent'
import type { Message } from '@ag-ui/client'

/** 会话级 AG-UI Agent */
export type SessionAguiAgent = UniAgent

/**
 * 为单个会话创建独立 UniAgent。
 *
 * @param options - cwd / messages / threadId
 * @returns 新的 UniAgent
 */
export function createSessionAgent(options?: {
  cwd?: string
  messages?: Message[]
  threadId?: string
}): UniAgent {
  const cwd = options?.cwd?.trim() || undefined

  return new UniAgent({
    role: 'session',
    agentId: 'openworker-desktop',
    description: 'OpenWorker desktop session agent',
    cwd,
    ...(options?.threadId ? { threadId: options.threadId } : {}),
    ...(options?.messages ? { initialMessages: options.messages } : {})
  })
}

/**
 * @deprecated 使用 createSessionAgent
 */
export function createSessionOpenWorkerAgent(options?: {
  cwd?: string
  messages?: Message[]
  threadId?: string
}): UniAgent {
  return createSessionAgent(options)
}

/** 应用级 MCP 宿主（warmup / probe / dispose），不用于会话 run */
let mcpHostAgent: UniAgent | undefined

/**
 * 获取（或惰性创建）应用级 MCP 宿主 UniAgent。
 *
 * @returns role=mcp-host 的 UniAgent
 */
export function getMcpHostAgent(): UniAgent {
  if (!mcpHostAgent) {
    mcpHostAgent = new UniAgent({
      role: 'mcp-host',
      agentId: 'openworker-mcp-host',
      description: 'OpenWorker desktop MCP host'
    })
  }
  return mcpHostAgent
}

/**
 * 设置变更后重建 MCP 宿主：先 dispose 再新建。
 *
 * @returns 重建后的 MCP 宿主 UniAgent
 */
export async function resetMcpHostAgent(): Promise<UniAgent> {
  if (mcpHostAgent) {
    await mcpHostAgent.dispose()
  }
  mcpHostAgent = new UniAgent({
    role: 'mcp-host',
    agentId: 'openworker-mcp-host',
    description: 'OpenWorker desktop MCP host'
  })
  return mcpHostAgent
}
