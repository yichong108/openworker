/**
 * MCP 池化预热（单飞 + 世代作废）
 */

import type { McpServerEntry } from '@openworker/shared'

import { getMcpHostAgent, resetMcpHostAgent } from './agent-instance.js'
import { agentLog } from '../logger.js'

/** 单台 MCP 池化预热结果 */
export type McpWarmupServerOk = { id: string; name: string; ok: true; toolCount: number }
export type McpWarmupServerErr = { id: string; name: string; ok: false; error: string }
export type McpWarmupServerResult = McpWarmupServerOk | McpWarmupServerErr

/** 一轮预热报告 */
export type McpWarmupReport = {
  atMs: number
  servers: McpWarmupServerResult[]
}

/** 预热状态（供 GET） */
export type McpWarmupStatus = {
  report: McpWarmupReport | null
  inFlight: boolean
}

let lastMcpWarmupReport: McpWarmupReport | null = null
/** 递增以作废进行中的预热结果（例如保存 MCP 后） */
let mcpWarmupGen = 0
let mcpWarmupPromise: Promise<McpWarmupReport> | null = null

/**
 * 读取最近一次预热状态。
 *
 * @returns 报告与是否进行中
 */
export function getMcpWarmupStatus(): McpWarmupStatus {
  return { report: lastMcpWarmupReport, inFlight: mcpWarmupPromise !== null }
}

/**
 * 执行一轮 MCP 池化预热。
 *
 * @returns 预热报告
 */
async function executeMcpWarmupCycle(): Promise<McpWarmupReport> {
  const gen = ++mcpWarmupGen
  const servers = (await getMcpHostAgent().mcp.warmup()) ?? []
  if (gen !== mcpWarmupGen) {
    return lastMcpWarmupReport ?? { atMs: Date.now(), servers: [] }
  }
  const report: McpWarmupReport = { atMs: Date.now(), servers }
  lastMcpWarmupReport = report
  return report
}

/**
 * 启动 MCP 预热（单飞：已有 promise 则复用）。
 *
 * @returns 预热报告
 */
export function startMcpWarmup(): Promise<McpWarmupReport> {
  if (mcpWarmupPromise) return mcpWarmupPromise
  const tracked = executeMcpWarmupCycle()
    .catch((error) => {
      agentLog.warn(
        `[mcp-warmup] failed: ${error instanceof Error ? error.message : String(error)}`
      )
      const report: McpWarmupReport = { atMs: Date.now(), servers: [] }
      lastMcpWarmupReport = report
      return report
    })
    .finally(() => {
      if (mcpWarmupPromise === tracked) mcpWarmupPromise = null
    })
  mcpWarmupPromise = tracked
  return tracked
}

/**
 * settings.mcpServers 变更后：作废世代、重建宿主、再预热。
 *
 * @param _servers - 新的 MCP 服务器列表（仅用于触发语义）
 */
export async function onMcpServersChanged(_servers?: McpServerEntry[]): Promise<McpWarmupReport> {
  mcpWarmupGen += 1
  mcpWarmupPromise = null
  await resetMcpHostAgent()
  return startMcpWarmup()
}

/** MCP 探测结果（与 Desktop / agent 对齐） */
export type McpProbeResult =
  | { ok: true; tools: Array<{ name: string; description?: string }> }
  | { ok: false; error: string }

/**
 * 探测 stdio MCP 工具列表（不落盘、不入池）。
 *
 * @param entry - MCP 服务器配置
 * @returns 探测结果
 */
export async function probeMcpServer(entry: McpServerEntry): Promise<McpProbeResult> {
  const result = await getMcpHostAgent().mcp.probe(entry)
  return result as McpProbeResult
}
