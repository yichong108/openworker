import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import scss from 'highlight.js/lib/languages/scss'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

import type { FileDiffLine } from './types.js'

let hljsReady = false

/**
 * 惰性注册 diff 常用语言（避免重复 register）。
 */
function ensureHljsLanguages(): void {
  if (hljsReady) return
  hljs.registerLanguage('javascript', javascript)
  hljs.registerLanguage('typescript', typescript)
  hljs.registerLanguage('json', json)
  hljs.registerLanguage('xml', xml)
  hljs.registerLanguage('html', xml)
  hljs.registerLanguage('css', css)
  hljs.registerLanguage('scss', scss)
  hljs.registerLanguage('markdown', markdown)
  hljs.registerLanguage('bash', bash)
  hljs.registerLanguage('shell', bash)
  hljs.registerLanguage('python', python)
  hljs.registerLanguage('yaml', yaml)
  hljs.registerLanguage('sql', sql)
  hljsReady = true
}

/** 扩展名 → highlight.js 语言 id */
const EXT_TO_LANG: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  jsonc: 'json',
  html: 'html',
  htm: 'html',
  xml: 'xml',
  svg: 'xml',
  css: 'css',
  scss: 'scss',
  less: 'css',
  md: 'markdown',
  markdown: 'markdown',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  py: 'python',
  yml: 'yaml',
  yaml: 'yaml',
  sql: 'sql'
}

/**
 * 根据文件路径猜测 highlight.js 语言。
 */
export function guessHighlightLanguage(filePath: string): string | undefined {
  const base = filePath.split(/[/\\]/).pop() || filePath
  const dot = base.lastIndexOf('.')
  if (dot < 0) return undefined
  const ext = base.slice(dot + 1).toLowerCase()
  return EXT_TO_LANG[ext]
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 将 highlight.js 生成的 HTML 按换行拆成行，并在行界正确闭合/重开 span。
 */
function splitHighlightedHtml(html: string): string[] {
  const lines: string[] = ['']
  const stack: string[] = []
  const tagRe = /<\/?span\b[^>]*>/gi
  let lastIndex = 0

  const appendText = (text: string) => {
    if (!text) return
    const parts = text.split('\n')
    for (let i = 0; i < parts.length; i += 1) {
      if (i > 0) {
        for (let s = stack.length - 1; s >= 0; s -= 1) {
          lines[lines.length - 1] += '</span>'
        }
        lines.push(stack.join(''))
      }
      lines[lines.length - 1] += parts[i]
    }
  }

  let match: RegExpExecArray | null
  while ((match = tagRe.exec(html))) {
    appendText(html.slice(lastIndex, match.index))
    const tag = match[0]
    if (tag.startsWith('</')) {
      stack.pop()
      lines[lines.length - 1] += tag
    } else {
      stack.push(tag)
      lines[lines.length - 1] += tag
    }
    lastIndex = match.index + tag.length
  }
  appendText(html.slice(lastIndex))
  return lines
}

/**
 * 将源码按行做语法高亮，返回与行对齐的 HTML 片段数组。
 */
export function highlightCodeLines(code: string, language?: string): string[] {
  if (code === '') return []
  const plain = code.split('\n').map(escapeHtml)
  if (!language) return plain

  ensureHljsLanguages()
  if (!hljs.getLanguage(language)) return plain

  try {
    const { value } = hljs.highlight(code, { language, ignoreIllegals: true })
    const parts = splitHighlightedHtml(value)
    if (parts.length !== plain.length) return plain
    return parts
  } catch {
    return plain
  }
}

/**
 * 取 diff 行应展示的行号（单列：删除用旧号，其余用新号）。
 */
export function displayLineNumber(line: FileDiffLine): number | undefined {
  if (line.kind === 'del') return line.oldLine
  return line.newLine ?? line.oldLine
}
