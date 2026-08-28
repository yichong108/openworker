/**
 * 从配置的目录路径加载基础 Skills（扫描 SKILL.md）。
 *
 * 这是 skills 包的核心能力：宿主只需传入 paths，即可获得 skill_* 工具与 prompt 提示。
 * 意图筛选、Electron 路径解析等增强由宿主自行实现。
 */

import type { Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import { tool, type Tool, type ToolSet } from 'ai'
import { z } from 'zod'

import { skillsLog } from './logger.js'

/** 单次 run 最多加载的技能数 */
export const MAX_LOADED_SKILLS = 96

/** 单个 SKILL.md 最大字节数 */
export const MAX_SKILL_MD_SIZE_BYTES = 10 * 1024 * 1024

type SkillMdMeta = {
  name?: string
  description?: string
}

/**
 * 扫描得到的技能元数据（不含正文），供 SkillManager 等渐进加载场景使用。
 */
export type ScannedSkill = {
  name: string
  description: string
  /** 扫描时使用的技能根目录绝对路径 */
  skillRootDir: string
  /** 含 SKILL.md 的技能目录绝对路径 */
  skillDirPath: string
  skillFilePath: string
  /** 相对 skillRootDir 的 SKILL.md 路径 */
  source: string
}

type ParsedSkillFile = ScannedSkill & { body: string }

/**
 * 工具生命周期观察回调（与 `@openworker/agent` 的 ToolOnTool 结构兼容）。
 *
 * AI SDK 的 ToolExecutionOptions 不含 onTool，故由宿主/工作流注入。
 * `id` 为工具名，`toolCallId` 为本次调用 ID。
 */
export type SkillToolOnTool = (e: {
  id: string
  toolCallId: string
  status: 'start' | 'end'
  args?: string
  result?: string
  timestampMs?: number
}) => void

/**
 * 从路径加载 skills 的结果。
 */
export type LoadedSkillsBundle = {
  tools: ToolSet
  /** 注入 system prompt 的技能摘要 */
  hint: string
}

/**
 * 技能列表项（供宿主 UI / IPC 展示，不含正文）。
 *
 * 字段与工具注册时使用的 name / description 一致，便于斜杠菜单选择后写入 `/name`。
 */
export type SkillListItem = {
  /** 规范化后的技能工具名（如 `code_review`） */
  name: string
  /** 技能描述（来自 frontmatter 或回退文案） */
  description: string
  /** 相对技能根目录的 SKILL.md 路径 */
  source: string
}

/**
 * 将任意字符串规范为合法工具名（小写、下划线）。
 *
 * @param input - 原始名称（frontmatter name 或目录名）
 * @returns 规范化后的工具名；空输入时返回 `custom`
 */
export function sanitizeSkillToolName(input: string): string {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!normalized) return 'custom'
  return normalized
}

/**
 * 判断 frontmatter 行是否为块标量指示符（`>` / `|` 及其 chomping 变体）。
 *
 * @param value - 冒号后的原始片段
 * @returns 块类型；非块标量时为 null
 */
function parseBlockScalarIndicator(value: string): 'folded' | 'literal' | null {
  const trimmed = value.trim()
  if (trimmed === '>' || trimmed.startsWith('>-')) return 'folded'
  if (trimmed === '|' || trimmed.startsWith('|-')) return 'literal'
  return null
}

/**
 * 读取 YAML frontmatter 块标量（`>` / `|`）的缩进正文。
 *
 * @param lines - frontmatter 按行拆分
 * @param startIndex - 块标量指示符下一行的下标
 * @param mode - folded 折叠为空格；literal 保留换行
 * @returns 解析值与消费后的行下标
 */
function readFrontmatterBlockScalar(
  lines: string[],
  startIndex: number,
  mode: 'folded' | 'literal'
): { value: string; nextIndex: number } {
  const blockLines: string[] = []
  let i = startIndex
  while (i < lines.length) {
    const line = lines[i]!
    if (line.trim() === '') {
      blockLines.push('')
      i++
      continue
    }
    const indentMatch = line.match(/^(\s+)/)
    if (!indentMatch) break
    blockLines.push(line.slice(indentMatch[1]!.length))
    i++
  }

  if (mode === 'literal') {
    return { value: blockLines.join('\n').trim(), nextIndex: i }
  }

  const folded = blockLines
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  return { value: folded, nextIndex: i }
}

/**
 * 解析 SKILL.md 的 YAML frontmatter（仅 name / description）。
 *
 * 支持单行值、引号值，以及 `>` / `|` 块标量（Cursor/Agent Skills 常见写法）。
 *
 * @param markdown - 完整 markdown 文本
 * @returns meta 与正文；无合法 frontmatter 时返回 null
 */
export function parseSkillFrontmatter(
  markdown: string
): { meta: SkillMdMeta; body: string } | null {
  const normalized = markdown.replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---\n')) return null
  const end = normalized.indexOf('\n---\n', 4)
  if (end < 0) return null
  const header = normalized.slice(4, end)
  const body = normalized.slice(end + 5).trim()
  const meta: SkillMdMeta = {}
  const lines = header.split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    const idx = line.indexOf(':')
    if (idx <= 0) {
      i++
      continue
    }
    const key = line.slice(0, idx).trim().toLowerCase()
    const rawValue = line.slice(idx + 1)
    const blockMode = parseBlockScalarIndicator(rawValue)
    let value: string
    if (blockMode) {
      const block = readFrontmatterBlockScalar(lines, i + 1, blockMode)
      value = block.value
      i = block.nextIndex
    } else {
      value = rawValue.trim().replace(/^['"]|['"]$/g, '')
      i++
    }
    if (key === 'name') meta.name = value
    if (key === 'description') meta.description = value
  }
  return { meta, body }
}

/**
 * 递归收集目录下所有名为 skill.md 的文件。
 *
 * @param absDir - 绝对目录路径
 * @returns 按路径排序的绝对文件路径列表
 */
async function collectSkillMarkdownFiles(absDir: string): Promise<string[]> {
  const queue: string[] = [absDir]
  const out: string[] = []
  while (queue.length) {
    const current = queue.shift()
    if (!current) break
    let entries: Dirent[] = []
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const abs = path.join(current, entry.name)
      if (entry.isDirectory()) {
        queue.push(abs)
        continue
      }
      if (entry.isFile() && entry.name.toLowerCase() === 'skill.md') {
        out.push(abs)
      }
    }
  }
  return out.sort((a, b) => a.localeCompare(b))
}

/**
 * 同名技能去重：先出现的胜出（靠前路径优先）。
 *
 * @param defs - 技能定义列表
 * @returns 去重后的列表
 */
function dedupeFirstWins(defs: SkillDefinition[]): SkillDefinition[] {
  const byName = new Map<string, SkillDefinition>()
  for (const item of defs) {
    if (!byName.has(item.name)) byName.set(item.name, item)
  }
  return [...byName.values()]
}

/**
 * 生成注入 system prompt 的技能摘要（列出全部已加载技能名称与描述）。
 *
 * @param defs - 已加载技能
 * @returns 提示文本；无技能时为空串
 */
function makeSkillHint(defs: SkillDefinition[]): string {
  if (!defs.length) return ''
  const lines = defs.map((item) => `- ${item.name}: ${item.description} (source: ${item.source})`)
  return `可用技能工具（可自动调用）：\n${lines.join('\n')}\n当用户意图与上述任一描述匹配时，必须先按上方准确名称调用对应技能工具（可传入概括用户问题的 question），再按需使用其他工具；不要跳过匹配技能而用泛化工具猜测。若用户消息包含独立的 \`/技能名\` token（如 \`/code_review\`），视为显式调用该技能，必须优先调用对应工具。`
}

/**
 * 从单个 SKILL.md 解析元数据与正文。
 *
 * @param absRoot - 技能根目录绝对路径
 * @param absPath - SKILL.md 绝对路径
 * @returns 解析结果；无效或超大文件时为 null
 */
async function readParsedSkillFile(
  absRoot: string,
  absPath: string
): Promise<ParsedSkillFile | null> {
  try {
    const st = await fs.stat(absPath)
    if (st.size > MAX_SKILL_MD_SIZE_BYTES) return null
    const rawMd = await fs.readFile(absPath, 'utf8')
    const parsed = parseSkillFrontmatter(rawMd)
    if (!parsed) return null
    const folderName = path.basename(path.dirname(absPath))
    const skillName = sanitizeSkillToolName(parsed.meta.name || folderName)
    const rel = path.relative(absRoot, absPath).replaceAll('\\', '/')
    const description =
      parsed.meta.description ||
      `Skill document: ${rel}. Follow skill instructions and call tools when necessary.`
    return {
      name: skillName,
      description,
      skillRootDir: absRoot,
      skillDirPath: path.dirname(absPath),
      skillFilePath: absPath,
      source: rel,
      body: parsed.body
    }
  } catch {
    return null
  }
}

/**
 * 扫描单个技能根目录下的全部 SKILL.md 元数据（不含正文）。
 *
 * @param absRoot - 技能根目录绝对路径
 * @returns 元数据列表；目录不存在或无 SKILL.md 时返回空数组
 */
export async function scanSkillsFromRoot(absRoot: string): Promise<ScannedSkill[]> {
  const mdFiles = await collectSkillMarkdownFiles(absRoot)
  const out: ScannedSkill[] = []
  for (const absPath of mdFiles) {
    if (out.length >= MAX_LOADED_SKILLS) break
    const parsed = await readParsedSkillFile(absRoot, absPath)
    if (!parsed) continue
    const { body: _body, ...meta } = parsed
    out.push(meta)
  }
  return out
}

type SkillDefinition = {
  name: string
  description: string
  source: string
  body: string
}

/**
 * 从配置的绝对路径列表解析并去重技能定义（含正文）。
 *
 * @param paths - 技能根目录绝对路径列表
 * @returns 去重后的技能定义；无有效路径时为空数组
 */
async function resolveSkillDefinitions(paths: string[]): Promise<SkillDefinition[]> {
  const cleaned = paths.map((p) => p.trim()).filter(Boolean)
  if (!cleaned.length) return []

  const defs: SkillDefinition[] = []
  for (const absRoot of cleaned) {
    await appendDefsFromRoot(absRoot, defs)
    if (defs.length >= MAX_LOADED_SKILLS) break
  }
  return dedupeFirstWins(defs)
}

/**
 * 将技能定义包装为单键 AI SDK ToolSet（含生命周期观察上报）。
 *
 * 行为与 `@openworker/agent` 的 defineTool 对齐，避免 skills → agent 环依赖。
 *
 * @param def - 技能定义
 * @param onTool - 工具生命周期观察回调
 * @returns 仅含该技能一项的 ToolSet
 */
function defineSkillTool(def: SkillDefinition, onTool: SkillToolOnTool): ToolSet {
  const id = def.name
  const parameters = z.object({ question: z.string().optional() })
  const truncateTo = 8_000

  const wrapped: Tool = tool({
    description: def.description,
    inputSchema: parameters,
    execute: async (input, options) => {
      const parsed = input as { question?: string }
      const toolCallId = options.toolCallId
      const startedAt = Date.now()
      let args: string
      try {
        args = JSON.stringify(parsed ?? {})
      } catch {
        args = String(parsed)
      }

      onTool({
        id,
        toolCallId,
        status: 'start',
        args,
        timestampMs: startedAt
      })

      const question = typeof parsed.question === 'string' ? parsed.question.trim() : ''
      const result = !question
        ? def.body
        : `User question: ${question}\n\nSkill document content:\n${def.body}`
      const resultStr = typeof result === 'string' ? result : String(result)
      const truncated = resultStr.slice(0, truncateTo)

      onTool({
        id,
        toolCallId,
        status: 'end',
        result: truncated,
        timestampMs: Date.now()
      })

      return result
    }
  })

  return { [id]: wrapped }
}

/**
 * 合并多个 AI SDK ToolSet（同名后者覆盖前者）。
 *
 * @param sets - 待合并的 ToolSet
 * @returns 合并后的 ToolSet
 */
function mergeToolSets(...sets: ToolSet[]): ToolSet {
  return Object.assign({}, ...sets) as ToolSet
}

/**
 * 列出技能元数据（不含正文），供宿主斜杠菜单等 UI 使用。
 *
 * 扫描与去重规则与 `loadSkillsFromPaths` 一致，保证菜单中的名称与实际注册工具名对齐。
 *
 * @param paths - 技能根目录绝对路径列表
 * @returns 技能列表项；目录不存在或无 SKILL.md 时返回空数组
 */
export async function listSkillsFromPaths(paths: string[]): Promise<SkillListItem[]> {
  const merged = await resolveSkillDefinitions(paths)
  return merged.map(({ name, description, source }) => ({
    name,
    description,
    source
  }))
}

/**
 * 从配置的绝对路径列表加载 Skills，并包装为 AI SDK ToolSet。
 *
 * 扫描顺序即优先级：同名技能以先出现的路径为准。不包含意图筛选；
 * 宿主若需按意图过滤，应在外部筛选 paths 或过滤返回的 tools。
 *
 * @param paths - 技能根目录绝对路径列表
 * @param onTool - 工具生命周期观察回调
 * @returns 工具 ToolSet 与 prompt hint
 */
export async function loadSkillsFromPaths(
  paths: string[],
  onTool: SkillToolOnTool
): Promise<LoadedSkillsBundle> {
  const cleaned = paths.map((p) => p.trim()).filter(Boolean)
  if (!cleaned.length) {
    return { tools: {}, hint: '' }
  }

  const merged = await resolveSkillDefinitions(cleaned)
  skillsLog.info(`[loadSkillsFromPaths] loaded=${merged.length} from ${cleaned.length} path(s)`)

  const tools = mergeToolSets(...merged.map((def) => defineSkillTool(def, onTool)))

  return {
    tools,
    hint: makeSkillHint(merged)
  }
}

/**
 * 从单个根目录解析技能定义。
 *
 * @param absRoot - 技能根目录绝对路径
 * @param defs - 累积写入的定义列表
 */
async function appendDefsFromRoot(absRoot: string, defs: SkillDefinition[]): Promise<void> {
  const mdFiles = await collectSkillMarkdownFiles(absRoot)
  for (const absPath of mdFiles) {
    if (defs.length >= MAX_LOADED_SKILLS) return
    const parsed = await readParsedSkillFile(absRoot, absPath)
    if (!parsed) continue
    defs.push({
      name: parsed.name,
      description: parsed.description,
      source: parsed.source,
      body: parsed.body
    })
  }
}
