import type {
  CreateTaskInput,
  TaskColumn,
  TaskDetail,
  TaskPriority,
  TaskSummary
} from './task-types'
import { COLUMN_STATUS_TEXT } from './task-types'

/** 序列化任务 markdown 所需的全部字段 */
type TaskMarkdownFields = {
  title: string
  status: TaskColumn
  priority: TaskPriority
  dependencies: string
  context: string
  requirements: string
  constraints: string
  agentNotes: string
}

const META_TITLES = new Set(['task notes', 'human notes', 'agent notes'])

/** markdown 解析出的分区 */
type ParsedSections = {
  title: string
  statusText: string
  priorityText: string
  dependencies: string
  context: string
  requirements: string
  constraints: string
  agentNotes: string
}

/**
 * 规范化标题，去掉 (Required) 并小写，便于兼容新旧模板。
 *
 * @param heading - 原始标题
 * @returns 规范化后的键
 */
function normalizeHeading(heading: string): string {
  return heading
    .replace(/\(Required\)/gi, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/**
 * 去掉分区首尾空行后拼回文本。
 *
 * @param lines - 分区内原始行
 * @returns 去掉首尾空白后的正文
 */
function trimSection(lines: string[]): string {
  let start = 0
  let end = lines.length
  while (start < end && lines[start].trim() === '') start += 1
  while (end > start && lines[end - 1].trim() === '') end -= 1
  return lines.slice(start, end).join('\n').trim()
}

/**
 * 解析任务 markdown 的标题与各分区。
 *
 * 兼容模板 `# Task Notes` + `## Task Status`，以及已完成任务
 * 以标题为 H1、分区带 `(Required)` 的写法。
 *
 * @param markdown - 任务文件全文
 * @returns 解析后的分区
 */
function parseSections(markdown: string): ParsedSections {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  let title = ''
  const sections: Record<string, string[]> = {}
  let current: string | null = null
  let inAgentNotes = false

  for (const line of lines) {
    const h1 = /^#\s+(.+)$/.exec(line)
    const h2 = /^##\s+(.+)$/.exec(line)
    const isH1 = Boolean(h1) && !line.startsWith('##')

    if (isH1 && h1) {
      const name = h1[1].trim()
      const key = normalizeHeading(name)
      if (key === 'agent notes') {
        inAgentNotes = true
        current = 'agent notes'
        sections[current] = []
        continue
      }
      if (key === 'human notes') {
        current = null
        continue
      }
      if (!title && !META_TITLES.has(key)) {
        title = name
        current = null
        continue
      }
      if (!title && key === 'task notes') {
        title = 'Task Notes'
      }
      current = null
      continue
    }

    if (h2 && !inAgentNotes) {
      current = normalizeHeading(h2[1])
      sections[current] = []
      continue
    }

    if (current) {
      sections[current].push(line)
    }
  }

  const pick = (key: string): string => trimSection(sections[key] ?? [])

  return {
    title,
    statusText: pick('task status'),
    priorityText: pick('task priority'),
    dependencies: pick('task dependencies') || '- None',
    context: pick('context') || '- None',
    requirements: pick('requirements') || '- None',
    constraints: pick('constraints') || '- None',
    agentNotes: pick('agent notes')
  }
}

/**
 * 从优先级分区取出 P0–P3；无法识别时视为 P2。
 *
 * @param text - 优先级分区正文
 * @returns 优先级
 */
function parsePriority(text: string): TaskPriority {
  const match = /\bP[0-3]\b/i.exec(text)
  if (!match) return 'P2'
  const value = match[0].toUpperCase()
  return value as TaskPriority
}

/**
 * 生成卡片摘要：优先 Requirements 首行，否则 Context。
 *
 * @param parsed - 已解析分区
 * @returns 截断后的摘要
 */
function makeExcerpt(parsed: ParsedSections): string {
  const source = parsed.requirements !== '- None' ? parsed.requirements : parsed.context
  const firstLine = source.split('\n').find((line) => line.trim() && line.trim() !== '- None')
  if (!firstLine) return ''
  const text = firstLine.replace(/^[-*]\s+/, '').trim()
  return text.length > 80 ? `${text.slice(0, 79)}…` : text
}

/**
 * 把 markdown 转成列表卡片字段。
 *
 * 标题若仍是模板占位 `Task Notes`，回退为文件名（去掉 .md）。
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
  const parsed = parseSections(markdown)
  const stem = fileName.replace(/\.md$/i, '')
  const title =
    !parsed.title || parsed.title === 'Task Notes' || META_TITLES.has(parsed.title.toLowerCase())
      ? stem
      : parsed.title

  return {
    id,
    fileName,
    title,
    status: column,
    priority: parsePriority(parsed.priorityText),
    dependencies: parsed.dependencies,
    excerpt: makeExcerpt(parsed),
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
  const parsed = parseSections(markdown)
  return {
    ...toTaskSummary(id, fileName, column, markdown, updatedAt),
    context: parsed.context,
    requirements: parsed.requirements,
    constraints: parsed.constraints,
    agentNotes: parsed.agentNotes,
    markdown
  }
}

/**
 * 把 Task Status 分区的第一行非空内容换成目标列对应状态。
 *
 * 找不到该分区时，在首个 H1 后插入标准 Status 段，避免改状态写丢。
 *
 * @param markdown - 原全文
 * @param column - 目标列
 * @returns 更新后的全文
 */
export function replaceTaskStatus(markdown: string, column: TaskColumn): string {
  const statusText = COLUMN_STATUS_TEXT[column]
  const normalized = markdown.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const headingIdx = lines.findIndex((line) => /^## Task Status(?:\(Required\))?\s*$/.test(line))

  if (headingIdx === -1) {
    const insert = ['', '## Task Status', '', statusText, '']
    const h1Idx = lines.findIndex((line) => /^#\s+/.test(line) && !line.startsWith('##'))
    if (h1Idx === -1) {
      return `${insert.join('\n').trim()}\n${normalized}`
    }
    lines.splice(h1Idx + 1, 0, ...insert)
    return lines.join('\n')
  }

  for (let i = headingIdx + 1; i < lines.length; i += 1) {
    if (/^#{1,6}\s+/.test(lines[i])) break
    if (lines[i].trim() !== '') {
      lines[i] = statusText
      return lines.join('\n')
    }
  }

  lines.splice(headingIdx + 1, 0, '', statusText)
  return lines.join('\n')
}

/**
 * 按约定拼出任务 markdown，保留状态、依赖与 Agent Notes。
 *
 * @param fields - 完整字段
 * @returns 完整 markdown
 */
export function serializeTaskMarkdown(fields: TaskMarkdownFields): string {
  const title = fields.title.trim()
  const dependencies = fields.dependencies.trim() || '- None'
  const context = fields.context.trim() || '- None'
  const requirements = fields.requirements.trim() || '- None'
  const constraints = fields.constraints.trim() || '- None'
  const agentNotes = fields.agentNotes.trim()
  const agentBlock = agentNotes ? `\n${agentNotes}\n` : '\n'

  return `# ${title}

## Task Status

${COLUMN_STATUS_TEXT[fields.status]}

## Task Priority

${fields.priority}

## Task Dependencies

${dependencies}

# Human Notes

## Context

${context}

## Requirements

${requirements}

## Constraints

${constraints}

# Agent Notes
${agentBlock}`
}

/**
 * 按约定拼出新建任务的 markdown（H1 为标题，Status 为 TODO）。
 *
 * @param input - 创建表单
 * @returns 完整 markdown
 */
export function buildTaskMarkdown(input: CreateTaskInput): string {
  return serializeTaskMarkdown({
    title: input.title?.trim() ?? '',
    status: input.status ?? 'todo',
    priority: input.priority ?? 'P1',
    dependencies: '- None',
    context: input.context?.trim() || '- None',
    requirements: input.requirements?.trim() || '- None',
    constraints: input.constraints?.trim() || '- None',
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
