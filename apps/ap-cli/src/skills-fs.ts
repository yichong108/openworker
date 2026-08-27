/**
 * 发现并读取工作区内的 skill。
 *
 * 内置 skill 在 `.agents/ap-config/skills`（`ap init` 安装，默认不暴露给外部工具）；
 * 同时兼容读取 `.agents/skills` 中的项目 skill。同名时内置目录优先。
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** skill 来源：内置（ap-config）或项目（.agents/skills） */
export type SkillSource = 'builtin' | 'project'

/** 已发现的 skill 元数据 */
export type AgentsSkill = {
  /** 目录名，即 CLI 子命令名 */
  name: string
  /** skill 目录绝对路径 */
  dir: string
  /** SKILL.md 绝对路径 */
  skillMd: string
  /** 来自 frontmatter 或标题的一行摘要，可能为空 */
  summary: string
  /** 相对工作区根的 skill 目录（POSIX，供 prompt 引用） */
  relDir: string
  /** 来自 ap-config 内置还是 .agents/skills */
  source: SkillSource
}

/**
 * 内置 skill 根目录（`ap init` 安装目标）。
 *
 * @param workspaceRoot - 工作区根目录
 * @returns `.agents/ap-config/skills` 绝对路径
 */
export function getBuiltinSkillsRoot(workspaceRoot: string): string {
  return join(workspaceRoot, '.agents', 'ap-config', 'skills')
}

/**
 * 项目 skill 根目录（Cursor 等外部工具也会读，ap 只读取不安装）。
 *
 * @param workspaceRoot - 工作区根目录
 * @returns `.agents/skills` 绝对路径
 */
export function getProjectSkillsRoot(workspaceRoot: string): string {
  return join(workspaceRoot, '.agents', 'skills')
}

/**
 * 从 SKILL.md 取出一行摘要，供 help 列表使用。
 *
 * @param markdown - SKILL.md 全文
 * @returns 摘要；解析不到则为空串
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
 * @param relPrefix - 相对工作区根的 POSIX 前缀，如 `.agents/ap-config/skills`
 * @param source - 来源标记
 * @returns 该目录下发现的 skill
 */
function listSkillsInRoot(root: string, relPrefix: string, source: SkillSource): AgentsSkill[] {
  if (!existsSync(root)) return []

  const skills: AgentsSkill[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = join(root, entry.name)
    const skillMd = join(dir, 'SKILL.md')
    if (!existsSync(skillMd)) continue

    let summary = ''
    try {
      summary = readSkillSummary(readFileSync(skillMd, 'utf8'))
    } catch {
      summary = ''
    }

    skills.push({
      name: entry.name,
      dir,
      skillMd,
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
 * 先读 `.agents/ap-config/skills`，再补 `.agents/skills` 中尚未出现的名字。
 *
 * @param workspaceRoot - 仓库根目录
 * @returns 按名称排序的 skill 列表
 */
export function listAgentsSkills(workspaceRoot: string): AgentsSkill[] {
  const byName = new Map<string, AgentsSkill>()

  for (const skill of listSkillsInRoot(
    getBuiltinSkillsRoot(workspaceRoot),
    '.agents/ap-config/skills',
    'builtin'
  )) {
    byName.set(skill.name, skill)
  }

  for (const skill of listSkillsInRoot(
    getProjectSkillsRoot(workspaceRoot),
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
 * 按调用名解析 skill：精确目录名，或 `ap-` 前缀的短名。
 *
 * 例如目录 `ap-task-execute` 可用 `ap-task-execute` 或 `task-execute`。
 * 若同时存在短名目录与 `ap-<短名>`，精确匹配优先。
 *
 * @param skills - 已发现的 skill
 * @param name - CLI 传入的名称
 * @returns 对应 skill；无法解析则为 undefined
 */
export function resolveAgentsSkill(
  skills: readonly AgentsSkill[],
  name: string
): AgentsSkill | undefined {
  const exact = skills.find((skill) => skill.name === name)
  if (exact) return exact
  if (name.startsWith('ap-')) return undefined
  return skills.find((skill) => skill.name === `ap-${name}`)
}

/**
 * 按名称解析 skill，支持省略 `ap-` 前缀。
 *
 * @param workspaceRoot - 仓库根目录
 * @param name - skill 目录名或短名
 * @returns 对应 skill；不存在则为 undefined
 */
export function findAgentsSkill(workspaceRoot: string, name: string): AgentsSkill | undefined {
  return resolveAgentsSkill(listAgentsSkills(workspaceRoot), name)
}

/**
 * `ap-` 开头 skill 的短名（去掉前缀）；其它 skill 返回 undefined。
 *
 * @param skillName - 目录名
 * @returns 短名；没有 `ap-` 前缀则为 undefined
 */
export function skillShortName(skillName: string): string | undefined {
  if (!skillName.startsWith('ap-')) return undefined
  const short = skillName.slice('ap-'.length)
  return short.length > 0 ? short : undefined
}
