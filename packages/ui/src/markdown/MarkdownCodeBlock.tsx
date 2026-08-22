import { useCallback, useEffect, useRef, useState } from 'react'

import { collectTextContent } from './collect-text-content.js'
import { CheckIcon, CopyIcon } from './CopyIcons.js'
import type { MarkdownCodeBlockProps } from './types.js'

/**
 * Markdown 围栏代码块：右上角复制按钮（不展示语言行）。
 *
 * 点击复制会写入剪贴板，并短暂切换为勾选图标作为反馈；
 * 事件 stopPropagation，避免触发外层 Markdown 外链确认逻辑。
 */
export function MarkdownCodeBlock({
  children,
  className = 'ow-markdown-codeblock',
  onCopyEmpty,
  onCopyError
}: MarkdownCodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    }
  }, [])

  const codeText = collectTextContent(children)

  const handleCopy = useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      if (!codeText) {
        onCopyEmpty?.()
        return
      }
      try {
        await navigator.clipboard.writeText(codeText)
        setCopied(true)
        if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
        resetTimerRef.current = setTimeout(() => setCopied(false), 1600)
      } catch (error) {
        onCopyError?.(error)
      }
    },
    [codeText, onCopyEmpty, onCopyError]
  )

  return (
    <div className={className}>
      <button
        type="button"
        className="ow-markdown-codeblock-copy"
        onClick={(event) => void handleCopy(event)}
        aria-label={copied ? '已复制' : '复制代码'}
        title={copied ? '已复制' : '复制'}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
      <pre>{children}</pre>
    </div>
  )
}
