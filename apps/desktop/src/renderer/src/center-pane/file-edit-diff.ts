/**
 * 从 write_file / delete_file 工具事件解析 diff 载荷，并用 jsdiff 计算行级变更。
 *
 * 新事件：args 为 `{ path, content }`，result 为 `{ path, before, after, created }`。
 * 旧事件：args 可能为 `{ summary: "path, content..." }`，result 为 `已写入：path`。
 */

import type { FileDiffLine, FileEditDiffView } from '@openworker/ui'
import { diffLines } from 'diff'

/** 展开区最多渲染的 diff 行数 */
const MAX_RENDER_DIFF_LINES = 400

function tryParseObject(raw?: string): Record<string, unknown> | null {
  if (!raw?.trim()) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // ignore
  }
  return null
}

function strField(obj: Record<string, unknown> | null, key: string): string | undefined {
  if (!obj) return undefined
  const value = obj[key]
  return typeof value === 'string' ? value : undefined
}

function parseLegacyWriteSummary(summary: string): {
  path?: string
  content?: string
} {
  const idx = summary.indexOf(', ')
  if (idx <= 0) {
    const trimmed = summary.trim()
    return trimmed ? { path: trimmed } : {}
  }
  return {
    path: summary.slice(0, idx).trim() || undefined,
    content: summary.slice(idx + 2)
  }
}

function parseWrittenPath(result: string): string | undefined {
  const m = /^(?:已写入|已删除)[:：]\s*(.+)$/.exec(result.trim())
  const path = m?.[1]?.trim()
  return path || undefined
}

/**
 * 用 jsdiff `diffLines` 计算行级 unified diff。
 */
export function computeLineDiff(before: string, after: string): FileDiffLine[] {
  if (before === '' && after === '') return []

  const changes = diffLines(before, after)
  const lines: FileDiffLine[] = []
  let oldLine = 1
  let newLine = 1

  for (const change of changes) {
    const raw = change.value
    const chunk = raw.endsWith('\n') ? raw.slice(0, -1) : raw
    const chunkLines = chunk === '' && raw === '\n' ? [''] : chunk.split('\n')

    if (chunkLines.length === 1 && chunkLines[0] === '' && !change.added && !change.removed) {
      if (!raw.includes('\n')) continue
    }

    for (const text of chunkLines) {
      if (change.added) {
        lines.push({ kind: 'add', text, newLine })
        newLine += 1
      } else if (change.removed) {
        lines.push({ kind: 'del', text, oldLine })
        oldLine += 1
      } else {
        lines.push({ kind: 'ctx', text, oldLine, newLine })
        oldLine += 1
        newLine += 1
      }
    }
  }

  return lines
}

/**
 * 从工具事件解析编辑 diff 视图模型；无法识别时返回 null。
 */
export function resolveFileEditDiff(
  name: string,
  args?: string,
  result?: string
): FileEditDiffView | null {
  if (name !== 'write_file' && name !== 'delete_file') return null

  const argsObj = tryParseObject(args)
  const resultObj = tryParseObject(result)

  let path =
    strField(resultObj, 'path') ||
    strField(argsObj, 'path') ||
    (result ? parseWrittenPath(result) : undefined)

  let before = strField(resultObj, 'before')
  let after = strField(resultObj, 'after') ?? strField(argsObj, 'content')
  let created =
    typeof resultObj?.created === 'boolean' ? resultObj.created : before == null || before === ''

  if ((!path || after == null) && argsObj && typeof argsObj.summary === 'string') {
    const legacy = parseLegacyWriteSummary(argsObj.summary)
    path = path || legacy.path
    if (after == null && legacy.content != null) after = legacy.content
    if (before == null) {
      before = ''
      created = true
    }
  }

  if (name === 'delete_file') {
    const deletePath = path || strField(argsObj, 'path')
    if (!deletePath) return null
    const deletedBefore = before ?? ''
    const lines = computeLineDiff(deletedBefore, '').slice(0, MAX_RENDER_DIFF_LINES)
    return {
      path: deletePath,
      before: deletedBefore,
      after: '',
      created: false,
      deleted: true,
      lines
    }
  }

  if (after == null) return null

  const beforeText = before ?? ''
  const afterText = after
  const allLines = computeLineDiff(beforeText, afterText)
  const truncated = allLines.length > MAX_RENDER_DIFF_LINES
  const lines = truncated ? allLines.slice(0, MAX_RENDER_DIFF_LINES) : allLines
  if (truncated) {
    lines.push({
      kind: 'ctx',
      text: `…[diff 已截断：共 ${allLines.length} 行，仅展示前 ${MAX_RENDER_DIFF_LINES} 行]`
    })
  }

  return {
    path: path || '（未知路径）',
    before: beforeText,
    after: afterText,
    created: Boolean(created && beforeText === ''),
    deleted: false,
    lines
  }
}
