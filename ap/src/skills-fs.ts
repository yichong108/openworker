/**
 * 发现并读取仓库根 `.agents/skills` 下的 skill。
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

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
 * 列出 `.agents/skills` 中带 SKILL.md 的目录。
 *
 * 后加入的 skill 只要放在该目录下就会被发现，无需改 CLI 白名单。
 *
 * @param workspaceRoot - 仓库根目录
 * @returns 按名称排序的 skill 列表
 */
export function listAgentsSkills(workspaceRoot: string): AgentsSkill[] {
  const root = join(workspaceRoot, '.agents', 'skills')
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

    skills.push({ name: entry.name, dir, skillMd, summary })
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name))
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
 * 按名称解析 `.agents/skills/<name>`，支持省略 `ap-` 前缀。
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
