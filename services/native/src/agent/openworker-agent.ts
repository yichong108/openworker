/**
 * OpenWorker 产品 Agent：直接引用 createAgent，独享 MCP，不经过 AG-UI。
 */

import { createAgent, type Agent, type AgentRunInput, type AgentRunResult } from '@openworker/agent'
import type { CoreMessage } from '@openworker/base-agent'
import type { McpProbeResult, McpWarmupServerResult } from '@openworker/mcp'
import type { McpServerEntry } from '@openworker/shared'
import { getOpenworkerMcpConfigPath } from '@openworker/shared/load-env'
import type { LanguageModel } from 'ai'

import { resolveOpenWorkerCapabilities } from './skills-mcp.js'
import { getDefaultMcpManager } from './singletons.js'

/**
 * MCP 宿主能力（探测 / 预热 / 释放连接池）。
 */
export type AgentMcp = {
  /** 一次性探测单个 MCP 服务器（不入池） */
  probe: (entry: McpServerEntry) => Promise<McpProbeResult>
  /**
   * 按 configPath 预热已启用的 MCP（池化建连）。
   * 未传时使用渠道目录 mcp.json。
   */
  warmup: (configPath?: string) => Promise<McpWarmupServerResult[]>
  /** 关闭所有池化 MCP 子进程（设置变更或应用退出时调用） */
  dispose: () => Promise<void>
}

/**
 * OpenWorkerAgent 创建配置。
 */
export type OpenWorkerAgentConfig = {
  /** 工作区根目录 */
  cwd?: string
  /** 对话模型；可在 send 时覆盖 */
  provider?: LanguageModel | null
  /** 会话 CoreMessage 初始值 */
  messages?: CoreMessage[]
}

/** 创建时占位模型（run 时经 send.provider 覆盖） */
const PLACEHOLDER_PROVIDER = {
  modelId: 'openworker-placeholder'
} as LanguageModel

/**
 * OpenWorker 产品 Agent：createAgent + 约定 Skills/MCP 装配 + 自有 mcp API。
 */
export class OpenWorkerAgent {
  private readonly inner: Agent
  readonly mcp: AgentMcp

  /**
   * 创建产品 Agent。
   *
   * @param config - cwd / provider / messages
   */
  constructor(config: OpenWorkerAgentConfig = {}) {
    const cwd = config.cwd?.trim() || undefined
    this.inner = createAgent({
      provider: config.provider ?? PLACEHOLDER_PROVIDER,
      ...(config.messages ? { messages: config.messages } : {}),
      ...(cwd ? { cwd } : {}),
      resolveCapabilities: resolveOpenWorkerCapabilities
    })

    const mcpManager = getDefaultMcpManager()
    this.mcp = {
      probe: (entry) => mcpManager.probe(entry),
      warmup: (configPath) =>
        mcpManager.warmupFromConfig((configPath?.trim() || getOpenworkerMcpConfigPath()).trim()),
      dispose: () => mcpManager.dispose()
    }
  }

  /**
   * 当前会话 CoreMessage；send 会追加本轮用户消息并写回。
   */
  get messages(): CoreMessage[] {
    return this.inner.messages
  }

  set messages(next: CoreMessage[]) {
    this.inner.messages = next
  }

  /**
   * 发起一次 run，委托 createAgent.send。
   *
   * @param userText - 本轮用户文本
   * @param input - 可选 run 参数
   * @returns 运行结束后的 messages 与助手文本
   */
  send(userText: string, input?: AgentRunInput): Promise<AgentRunResult> {
    return this.inner.send(userText, input)
  }

  /**
   * 关闭 MCP 连接池。
   */
  async dispose(): Promise<void> {
    await this.mcp.dispose()
  }
}
