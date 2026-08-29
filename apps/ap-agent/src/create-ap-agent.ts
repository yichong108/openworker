/**
 * createApAgent — AP 产品 Agent 工厂，直接引用 createAgent，不注入额外能力。
 */

import { createAgent, type Agent, type CreateAgentOptions } from '@openworker/agent'

/**
 * AP Agent 创建配置（不含 resolveCapabilities）。
 */
export type CreateApAgentOptions = Omit<CreateAgentOptions, 'resolveCapabilities'>

/**
 * 创建 AP 产品 Agent 实例。
 *
 * 仅透传 createAgent 的 provider / messages / cwd，不装配 MCP、Skills 等额外能力。
 *
 * @param options - 创建配置；provider 必填
 * @returns 可 send 的 agent 实例
 */
export function createApAgent(options: CreateApAgentOptions): Agent {
  return createAgent(options)
}
