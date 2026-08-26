/**
 * OpenWorker 产品约定：从 ~/.agents/skills、工作区 .agents/skills 与渠道 mcp.json 加载能力。
 */

import path from 'node:path'

import type {
  AgentCapabilities,
  ResolveAgentCapabilities,
  WorkspacePromptExtras
} from '@openworker/agent'
import { loadMcpServersFromConfig } from '@openworker/mcp'
import { type AgentComposerMode } from '@openworker/shared'
import { getOpenworkerMcpConfigPath } from '@openworker/shared/load-env'
import { mergeToolSets, type ToolOnTool } from '@openworker/tools'

import { getDefaultMcpManager, getSingleSkillManager } from './singletons.js'

/**
 * 组装 MCP 相关 system prompt 段落。
 *
 * @param servers - 已解析的 MCP 条目
 * @param contextHints - 连接池收集的说明 / 工具索引
 * @returns extraPrompt 文本；无内容时为空串
 */
function buildMcpExtraPrompt(
  servers: Awaited<ReturnType<typeof loadMcpServersFromConfig>>,
  contextHints: string
): string {
  const parts: string[] = [`mcp 配置文件路径：${getOpenworkerMcpConfigPath()}；`]

  if (servers.length > 0) {
    const enabled = servers.filter((s) => s.enabled && s.command.trim())
    const mcpMeta =
      '- **MCP 管理（元工具）**：`mcp_list_servers` 列出已配置的 MCP（环境变量已脱敏）；`mcp_inspect_server` 探测指定 MCP 暴露的工具。需要连接信息或工具名时优先使用；不要向用户索要应用中已保存的密码。'
    if (enabled.length > 0) {
      const names = enabled.map((s) => s.name || s.id)
      parts.push(
        `${mcpMeta}\n- 已启用的 MCP（stdio）服务：${names.join(', ')}。以 mcp_ 开头的工具来自各 MCP；调用时传入 JSON，键名需符合该工具的 inputSchema。`
      )
    } else {
      parts.push(
        `${mcpMeta}\n- 当前 MCP 条目未启用或 command 为空；用户启用后才会出现 mcp_* 工具。`
      )
    }
  }

  if (contextHints) {
    parts.push(contextHints)
  }

  return parts.filter(Boolean).join('\n\n')
}

/**
 * 按 OpenWorker 约定加载本轮 Skills / MCP 工具与 prompt 增强片段。
 *
 * ask / plan 模式下跳过（不暴露 readSkill* / mcp_*，也不注入技能名摘要）。
 * 目录或文件不存在时加载结果为空，不抛错。
 *
 * @param composerMode - 发送模式
 * @param workspaceRoot - 工作区根目录（用于 project skills 路径）
 * @param onTool - 工具生命周期观察回调
 * @returns 合并后的额外 ToolSet 与注入 system prompt 的 extras
 */
export async function loadOpenWorkerSkillsAndMcp(
  composerMode: AgentComposerMode,
  workspaceRoot: string,
  onTool: ToolOnTool
): Promise<AgentCapabilities> {
  if (composerMode === 'ask' || composerMode === 'plan') {
    return {
      tools: {},
      promptExtras: { extraPrompt: `mcp 配置文件路径：${getOpenworkerMcpConfigPath()}；` }
    }
  }

  const skillManager = getSingleSkillManager()
  await skillManager.init(onTool)
  await skillManager.addSkillRootDir('project', path.join(workspaceRoot, '.agents', 'skills'))
  const skillBundle = skillManager.toPromptAndTools()

  const mcpManager = getDefaultMcpManager()
  const servers = await loadMcpServersFromConfig(getOpenworkerMcpConfigPath())
  const mcpTools = await mcpManager.buildMcpTools(servers, onTool)
  const contextHints = await mcpManager.collectContextHints(servers)

  const promptExtras: WorkspacePromptExtras = {
    ...(skillBundle.hint ? { skillHint: skillBundle.hint } : {})
  }
  const extraPrompt = buildMcpExtraPrompt(servers, contextHints)
  if (extraPrompt) {
    promptExtras.extraPrompt = extraPrompt
  }

  return {
    tools: mergeToolSets(skillBundle.tools, mcpTools),
    promptExtras
  }
}

/**
 * 供 createAgent 注入的能力解析函数。
 */
export const resolveOpenWorkerCapabilities: ResolveAgentCapabilities = async (ctx) =>
  loadOpenWorkerSkillsAndMcp(ctx.composerMode, ctx.workspaceRoot, ctx.onTool)
