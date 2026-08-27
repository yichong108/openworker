/**
 * 组装发给 Cursor Agent 的通用 skill 启动提示词。
 */

import { readFile } from 'node:fs/promises'

import { findAgentsSkill, type AgentsSkill } from './skills-fs.js'

/**
 * 读取指定 skill 的 SKILL.md。
 *
 * 内联进 prompt，避免本地 runtime 未加载 filesystem skills 时 Agent 不知道流程。
 * 查找顺序：`.agents/ap-config/skills`，再 `.agents/skills`。
 *
 * @param cwd - 仓库根目录
 * @param skillName - skill 目录名
 * @returns skill Markdown
 */
export async function readAgentsSkillMarkdown(cwd: string, skillName: string): Promise<string> {
  const skill = findAgentsSkill(cwd, skillName)
  const skillPath = skill?.skillMd
  if (!skillPath) {
    throw new Error(
      `未找到 skill: ${skillName}\n请确认 \`.agents/ap-config/skills/${skillName}/SKILL.md\` 或 \`.agents/skills/${skillName}/SKILL.md\` 存在。`
    )
  }
  try {
    return await readFile(skillPath, 'utf8')
  } catch {
    throw new Error(
      `未找到 skill: ${skillPath}\n请确认 \`.agents/ap-config/skills/${skillName}/SKILL.md\` 或 \`.agents/skills/${skillName}/SKILL.md\` 存在。`
    )
  }
}

/**
 * 读取已发现 skill 的 SKILL.md 全文，供提问模式内联。
 *
 * @param cwd - 仓库根目录
 * @param skills - 已发现的 skill
 * @returns skill 名到正文的映射
 */
export async function readAgentsSkillBodies(
  cwd: string,
  skills: readonly AgentsSkill[]
): Promise<Record<string, string>> {
  const bodies: Record<string, string> = {}
  for (const skill of skills) {
    bodies[skill.name] = await readAgentsSkillMarkdown(cwd, skill.name)
  }
  return bodies
}

/**
 * 生成用户提问启动提示：列出可用 skill，由 Agent 选一个并立即执行。
 *
 * @param query - 用户原话
 * @param skills - 已发现的 skill（含摘要）
 * @param skillBodies - 各 skill 的 SKILL.md 全文
 * @returns 发给 Agent.send 的文本
 */
export function buildAskPrompt(
  query: string,
  skills: readonly AgentsSkill[],
  skillBodies: Readonly<Record<string, string>>
): string {
  const catalog = skills
    .map((skill) => {
      const summary = skill.summary ? ` — ${skill.summary}` : ''
      return `- \`${skill.name}\`${summary}\n  路径：\`${skill.relDir}/\``
    })
    .join('\n')

  const bodies = skills
    .map((skill) => {
      const body = skillBodies[skill.name] ?? ''
      return `## ${skill.name} skill\n\n${body}`
    })
    .join('\n\n')

  return `你是本仓库的 Agent。用户没有指定 skill，只给了一句提问。你必须从下方「可用 skill」中选出最合适的一个，严格遵循其 SKILL.md 执行，不要发明 skill 之外的流程或需求。

## 用户提问

\`${query}\`

## 本次指令

根据提问选择最合适的 **一个** skill 并立即执行。不要询问是否开始。
都不合适就说明原因后结束，不要发明新 skill，也不要同时执行多个 skill。
先读 \`.agents/AGENTS.md\`。

## 可用 skill

${catalog || '（无）'}

${bodies}
`
}

/**
 * 生成一次性启动提示：强制遵循指定 skill 并立即开始执行。
 *
 * @param skillName - skill 目录名
 * @param skillMarkdown - SKILL.md 全文
 * @param extra - 可选补充指令（如 --task 或剩余参数）
 * @param relDir - 相对工作区根的 skill 目录，供 Agent 读取附属文件
 * @returns 发给 Agent.send 的文本
 */
export function buildSkillPrompt(
  skillName: string,
  skillMarkdown: string,
  extra?: string,
  relDir?: string
): string {
  const extraBlock = extra ? `\n用户补充指令：\`${extra}\`。在不违反 skill 的前提下遵从。\n` : ''
  const skillPath = relDir ?? `.agents/ap-config/skills/${skillName}`

  return `你是本仓库的 Agent。必须严格遵循下方 **${skillName}** skill，不要发明 skill 之外的流程或需求。

## 本次指令

立即开始执行 ${skillName}。不要询问是否开始。skill 要求结束时就结束。
${extraBlock}
先读 \`.agents/AGENTS.md\`。

项目 skill 路径：\`${skillPath}/\`（含 references 等附属文件）。

## ${skillName} skill

${skillMarkdown}
`
}
