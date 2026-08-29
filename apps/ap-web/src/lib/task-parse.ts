import type {
  CreateTaskInput,
  TaskColumn,
  TaskDetail,
  TaskPriority,
  TaskSummary
} from './task-types'
import { isTaskPriority } from './task-types'

/** 序列化任务 markdown 所需的全部字段 */
type TaskMarkdownFields = {
  title: string
  priority: TaskPriority
  description: string
  agentNotes: string
}

const TITLE_PLACEHOLDERS = new Set(['标题', '<任务名称>'])

/** frontmatter 解析结果 */
type TaskFrontmatter = {
  name: string
  description: string
  priority: string
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
 * 解析任务 YAML frontmatter（name / description / priority）。
 *
 * @param markdown - 完整 markdown 文本
 * @returns meta 与正文；无合法 frontmatter 时返回 null
 */
function parseTaskFrontmatter(markdown: string): { meta: TaskFrontmatter; body: string } | null {
  const normalized = markdown.replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---\n')) return null
  const end = normalized.indexOf('\n---\n', 4)
  if (end < 0) return null

  const header = normalized.slice(4, end)
  const body = normalized.slice(end + 5).trim()
  const meta: TaskFrontmatter = { name: '', description: '', priority: '' }
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
    if (key === 'priority') meta.priority = value
  }

  return { meta, body }
}

/**
 * 去掉 HTML 注释与纯占位注释行。
 *
 * @param text - 原始正文
 * @returns 清理后的正文
 */
function stripAgentPlaceholder(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim()
}

/**
 * 解析任务 markdown（YAML frontmatter + 正文）。
 *
 * @param markdown - 任务文件全文
 * @returns 统一字段；无 frontmatter 时各字段为空
 */
function parseTaskMarkdown(markdown: string): {
  title: string
  priorityText: string
  description: string
  agentNotes: string
} {
  const frontmatter = parseTaskFrontmatter(markdown)
  if (!frontmatter) {
    return { title: '', priorityText: '', description: '', agentNotes: '' }
  }

  return {
    title: frontmatter.meta.name.trim(),
    priorityText: frontmatter.meta.priority.trim(),
    description: frontmatter.meta.description.trim(),
    agentNotes: stripAgentPlaceholder(frontmatter.body)
  }
}

/**
 * 从优先级字段取出 P0–P3；无法识别时视为 P2。
 *
 * @param text - 优先级正文
 * @returns 优先级
 */
function parsePriority(text: string): TaskPriority {
  const match = /\bP[0-3]\b/i.exec(text)
  if (!match) return 'P2'
  const value = match[0].toUpperCase()
  return value as TaskPriority
}

/**
 * 判断标题是否仍为模板占位。
 *
 * @param title - 解析出的标题
 * @returns 是否为占位
 */
function isTitlePlaceholder(title: string): boolean {
  const normalized = title.trim().toLowerCase()
  return !normalized || TITLE_PLACEHOLDERS.has(normalized)
}

/**
 * 把单行 frontmatter 字段序列化为 YAML。
 *
 * @param key - 字段名
 * @param value - 字段值
 * @returns frontmatter 行或块
 */
function serializeScalarField(key: string, value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return `${key}: \n`

  if (!trimmed.includes('\n') && !/[:#>|@`"'\\]/.test(trimmed) && !trimmed.startsWith('-')) {
    return `${key}: ${trimmed}`
  }

  if (!trimmed.includes('\n')) {
    return `${key}: "${trimmed.replace(/"/g, '\\"')}"`
  }

  const lines = trimmed.split('\n').map((line) => `  ${line}`)
  return `${key}: |\n${lines.join('\n')}`
}

/**
 * 把 description 序列化为 YAML frontmatter 字段。
 *
 * @param text - 描述正文
 * @returns frontmatter 中的 description 段
 */
function serializeDescriptionField(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return 'description: \n'

  if (!trimmed.includes('\n')) {
    if (/[:#>|@`]/.test(trimmed) || trimmed.startsWith('-')) {
      return `description: >\n  ${trimmed}`
    }
    return `description: ${trimmed}`
  }

  const lines = trimmed.split('\n').map((line) => `  ${line}`)
  return `description: |\n${lines.join('\n')}`
}

/**
 * 把 markdown 转成列表卡片字段。
 *
 * 标题若仍是模板占位，回退为文件名（去掉 .md）。
 *
 * @param id - 相对 tasks 根的路径
 * @param fileName - 文件名
 * @param column - 所在列（目录）
 * @param markdown - 文件全文
 * @param updatedAt - 文件 mtime 的 ISO 时间
 * @returns 卡片摘要
 */
export function toTaskSummary(
  id: string,
  fileName: string,
  column: TaskColumn,
  markdown: string,
  updatedAt: string
): TaskSummary {
  const parsed = parseTaskMarkdown(markdown)
  const stem = fileName.replace(/\.md$/i, '')
  const title = isTitlePlaceholder(parsed.title) ? stem : parsed.title

  return {
    id,
    fileName,
    title,
    status: column,
    priority: parsePriority(parsed.priorityText),
    updatedAt
  }
}

/**
 * 把 markdown 转成展开详情字段。
 *
 * @param id - 相对 tasks 根的路径
 * @param fileName - 文件名
 * @param column - 所在列（目录）
 * @param markdown - 文件全文
 * @param updatedAt - 文件 mtime 的 ISO 时间
 * @returns 详情
 */
export function toTaskDetail(
  id: string,
  fileName: string,
  column: TaskColumn,
  markdown: string,
  updatedAt: string
): TaskDetail {
  const parsed = parseTaskMarkdown(markdown)
  return {
    ...toTaskSummary(id, fileName, column, markdown, updatedAt),
    description: parsed.description,
    agentNotes: parsed.agentNotes,
    markdown
  }
}

/**
 * 移动任务列时不再改写文件内容（状态以目录为准）。
 *
 * @param markdown - 原全文
 * @param _column - 目标列（保留参数以兼容调用方）
 * @returns 原全文
 */
export function replaceTaskStatus(markdown: string, _column: TaskColumn): string {
  return markdown
}

/**
 * 按 frontmatter 模板拼出任务 markdown。
 *
 * @param fields - 完整字段
 * @returns 完整 markdown
 */
export function serializeTaskMarkdown(fields: TaskMarkdownFields): string {
  const title = fields.title.trim()
  const description = fields.description.trim()
  const priority = isTaskPriority(fields.priority) ? fields.priority : 'P2'
  const agentNotes = fields.agentNotes.trim()
  const body = agentNotes || '<!-- 由Agent填写 -->'

  return `---
${serializeScalarField('name', title)}
${serializeDescriptionField(description)}
priority: ${priority}
---
${body}
`
}

/**
 * 按约定拼出新建任务的 markdown。
 *
 * @param input - 创建表单
 * @returns 完整 markdown
 */
export function buildTaskMarkdown(input: CreateTaskInput): string {
  return serializeTaskMarkdown({
    title: input.title?.trim() ?? '',
    priority: input.priority ?? 'P1',
    description: input.description?.trim() ?? '',
    agentNotes: ''
  })
}

/**
 * 生成本地时间戳 YYYYMMDDHHmmSS，用于默认文件名。
 *
 * @param date - 基准时间
 * @returns 14 位数字时间戳
 */
export function formatLocalTimestamp(date: Date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('')
}
