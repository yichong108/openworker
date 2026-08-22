import './file-edit-diff.scss'

import { useMemo } from 'react'

import { displayLineNumber, guessHighlightLanguage, highlightCodeLines } from './highlight.js'
import type { FileDiffLine, FileEditDiffView } from './types.js'

export type FileEditDiffProps = {
  /** 已解析的 diff 视图模型 */
  view: FileEditDiffView
  /** 根容器 className */
  className?: string
}

type FileDiffLineRowProps = {
  line: FileDiffLine
  index: number
  codeHtml: string
}

/**
 * 将纯文本转义为可安全写入 innerHTML 的片段。
 *
 * @param text - 原始行文本
 */
function escapePlain(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 渲染单行 unified diff（行号 + +/- + 语法高亮）。
 */
function FileDiffLineRow({ line, index, codeHtml }: FileDiffLineRowProps) {
  const prefix = line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '
  const lineno = displayLineNumber(line)
  return (
    <div className={`ow-file-diff-line is-${line.kind}`} data-diff-index={index}>
      <span className="ow-file-diff-lineno" aria-hidden>
        {lineno ?? ''}
      </span>
      <span className="ow-file-diff-sign" aria-hidden>
        {prefix}
      </span>
      <span className="ow-file-diff-code" dangerouslySetInnerHTML={{ __html: codeHtml || ' ' }} />
    </div>
  )
}

/**
 * 编辑文件展开区：jsdiff 计算 + 轻量 unified 渲染（无文件名头、带行号）。
 */
export function FileEditDiff({ view, className }: FileEditDiffProps) {
  const language = useMemo(() => guessHighlightLanguage(view.path), [view.path])
  const beforeHtmlLines = useMemo(
    () => highlightCodeLines(view.before, language),
    [view.before, language]
  )
  const afterHtmlLines = useMemo(
    () => highlightCodeLines(view.after, language),
    [view.after, language]
  )

  const codeHtmlForLine = (line: FileDiffLine): string => {
    if (line.kind === 'del' && line.oldLine != null) {
      return beforeHtmlLines[line.oldLine - 1] ?? escapePlain(line.text)
    }
    if (line.newLine != null) {
      return afterHtmlLines[line.newLine - 1] ?? escapePlain(line.text)
    }
    return escapePlain(line.text)
  }

  const rootClass = className ? `ow-file-diff ${className}` : 'ow-file-diff'

  return (
    <div className={rootClass} role="region" aria-label={`${view.path} 的变更`}>
      {view.lines.length === 0 ? (
        <div className="ow-file-diff-empty">（无内容变更）</div>
      ) : (
        view.lines.map((line, index) => (
          <FileDiffLineRow
            key={`${line.kind}-${line.oldLine ?? ''}-${line.newLine ?? ''}-${index}`}
            line={line}
            index={index}
            codeHtml={codeHtmlForLine(line)}
          />
        ))
      )}
    </div>
  )
}
