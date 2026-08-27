import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { getWorkspaceRoot } from './workspace-root'

/** skill 来源：内置（ap-config）或项目（.agents/skills） */
export type SkillSource = 'builtin' | 'project'

/** 工作区内发现的 skill 摘要 */
export type AgentsSkill = {
  name: string
  summary: string
  /** 相对工作区根的 skill 目录（POSIX） */
  relDir: string
  source: SkillSource
}

/**
 * 从 SKILL.md 取出一行描述，供工具集表格使用。
 *
 * @param markdown - SKILL.md 全文
 * @returns 描述；解析不到则为空串
 */
export function readSkillSummary(markdown: string): string {
  const folded = markdown.match(/^description:\s*>\s*\n((?:[ \t]+.+\n)+)/m)
  if (folded) {
    const line = folded[1]
      .split('\n')
      .map((row) => row.trim())
      .find((row) => row.length > 0)
    if (line) return line
  }

  const inline = markdown.match(/^description:\s*(.+)$/m)
  if (inline?.[1] && !inline[1].startsWith('>')) return inline[1].trim()

  const heading = markdown.match(/^#\s+(.+)$/m)
  return heading?.[1]?.trim() ?? ''
}

/**
 * 扫描单个 skill 根目录下带 SKILL.md 的子目录。
 *
 * @param root - skill 根目录绝对路径
 * @param relPrefix - 相对工作区根的 POSIX 前缀
 * @param source - 来源标记
 * @returns 该目录下发现的 skill
 */
function listSkillsInRoot(root: string, relPrefix: string, source: SkillSource): AgentsSkill[] {
  if (!existsSync(root)) return []

  const skills: AgentsSkill[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const skillMd = join(root, entry.name, 'SKILL.md')
    if (!existsSync(skillMd)) continue

    let summary = ''
    try {
      summary = readSkillSummary(readFileSync(skillMd, 'utf8'))
    } catch {
      summary = ''
    }
    skills.push({
      name: entry.name,
      summary,
      relDir: `${relPrefix}/${entry.name}`,
      source
    })
  }
  return skills
}

/**
 * 列出工作区内带 SKILL.md 的 skill。
 *
 * 先读 `.agents/ap-config/skills`（`ap init` 安装的内置 skill），
 * 再补 `.agents/skills` 中尚未出现的名字。
 *
 * @returns 按名称排序的 skill 列表
 */
export function listAgentsSkills(): AgentsSkill[] {
  const workspaceRoot = getWorkspaceRoot()
  const byName = new Map<string, AgentsSkill>()

  for (const skill of listSkillsInRoot(
    join(workspaceRoot, '.agents', 'ap-config', 'skills'),
    '.agents/ap-config/skills',
    'builtin'
  )) {
    byName.set(skill.name, skill)
  }

  for (const skill of listSkillsInRoot(
    join(workspaceRoot, '.agents', 'skills'),
    '.agents/skills',
    'project'
  )) {
    if (!byName.has(skill.name)) {
      byName.set(skill.name, skill)
    }
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * 按目录名查找已发现的 skill。
 *
 * @param name - skill 目录名
 * @returns 对应 skill；不存在则为 undefined
 */
export function findAgentsSkill(name: string): AgentsSkill | undefined {
  return listAgentsSkills().find((skill) => skill.name === name)
}

/**
 * 读取指定 skill 的 SKILL.md 全文。
 *
 * @param name - skill 目录名
 * @returns markdown 正文
 */
export function readSkillMarkdown(name: string): string {
  const trimmed = name.trim()
  if (!trimmed || trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
    throw new Error('非法 skill 名')
  }
  const skill = findAgentsSkill(trimmed)
  if (!skill) {
    throw new Error(`未找到 skill: ${trimmed}`)
  }
  const skillMd = join(getWorkspaceRoot(), ...skill.relDir.split('/'), 'SKILL.md')
  if (!existsSync(skillMd)) {
    throw new Error(`未找到 skill: ${trimmed}`)
  }
  return readFileSync(skillMd, 'utf8')
}

/**
 * 生成执行指定 skill 的启动提示，内联 SKILL.md。
 *
 * @param skillName - skill 目录名
 * @param skillMarkdown - SKILL.md 全文
 * @param extra - 可选用户补充（空则按 skill 默认流程）
 * @param relDir - 相对工作区根的 skill 目录
 * @returns 发给 Agent.send 的文本
 */
export function buildSkillPrompt(
  skillName: string,
  skillMarkdown: string,
  extra?: string,
  relDir?: string
): string {
  const extraBlock = extra?.trim()
    ? `\n用户补充指令：\`${extra.trim()}\`。在不违反 skill 的前提下遵从。\n`
    : ''
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
