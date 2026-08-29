/**
 * AP 产品约定：从 `.agents/ap-config/skills` 与 `.agents/skills` 加载渐进披露技能。
 */

import path from 'node:path'

import type { AgentCapabilities, ResolveAgentCapabilities } from '@openworker/agent'
import type { AgentComposerMode } from '@openworker/shared'
import { SkillManager } from '@openworker/skills'
import type { ToolOnTool } from '@openworker/tools'

let skillManager: SkillManager | null = null

/**
 * 获取进程内 AP SkillManager 单例。
 */
function getApSkillManager(): SkillManager {
  skillManager ??= new SkillManager()
  return skillManager
}

/**
 * 释放 SkillManager 单例（测试 / 进程退出）。
 */
export function disposeApSkillManager(): void {
  skillManager?.dispose()
  skillManager = null
}

/**
 * 按 AP 约定加载本轮 Skills 工具与 prompt 增强片段。
 *
 * ask / plan 模式下跳过（不暴露 readSkill*，也不注入技能名摘要）。
 * 目录不存在时加载结果为空，不抛错。
 *
 * @param composerMode - 发送模式
 * @param workspaceRoot - 工作区根目录
 * @param onTool - 工具生命周期观察回调
 */
export async function loadApSkills(
  composerMode: AgentComposerMode,
  workspaceRoot: string,
  onTool: ToolOnTool
): Promise<AgentCapabilities> {
  if (composerMode === 'ask' || composerMode === 'plan') {
    return { tools: {}, promptExtras: {} }
  }

  const manager = getApSkillManager()
  await manager.init(onTool)
  await manager.setSkillRootDirs({
    builtin: path.join(workspaceRoot, '.agents', 'ap-config', 'skills'),
    project: path.join(workspaceRoot, '.agents', 'skills')
  })
  const skillBundle = manager.toPromptAndTools()

  return {
    tools: skillBundle.tools,
    promptExtras: skillBundle.hint ? { skillHint: skillBundle.hint } : {}
  }
}

/**
 * 供 createApAgent 注入的能力解析函数。
 */
export const resolveApCapabilities: ResolveAgentCapabilities = async (ctx) =>
  loadApSkills(ctx.composerMode, ctx.workspaceRoot, ctx.onTool)
