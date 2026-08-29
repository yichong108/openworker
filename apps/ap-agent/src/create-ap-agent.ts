/**
 * createApAgent — AP 产品 Agent 工厂：createAgent + AP 约定 Skills。
 */

import { createAgent, type Agent, type CreateAgentOptions } from '@openworker/agent'

import { resolveApCapabilities } from './resolve-ap-skills.js'

/**
 * AP Agent 创建配置（不含 resolveCapabilities）。
 */
export type CreateApAgentOptions = Omit<CreateAgentOptions, 'resolveCapabilities'>

/**
 * 创建 AP 产品 Agent 实例。
 *
 * 透传 createAgent 的 cwd，并装配 AP 约定 Skills（`.agents/ap-config/skills`、`.agents/skills`）；
 * 不装配 MCP。provider / messages 在 send 时传入。
 *
 * @param options - 创建配置
 * @returns 可 send 的 agent 实例
 */
export function createApAgent(options: CreateApAgentOptions): Agent {
  return createAgent({
    ...options,
    resolveCapabilities: resolveApCapabilities
  })
}
