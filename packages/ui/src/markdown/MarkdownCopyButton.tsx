import { useCallback, useEffect, useRef, useState } from 'react'

import { CheckIcon, CopyIcon } from './CopyIcons.js'
import type { MarkdownCopyButtonProps } from './types.js'

/**
 * Markdown 全文复制按钮。
 *
 * 点击复制会写入剪贴板，并短暂切换为勾选图标作为反馈。
 */
export function MarkdownCopyButton({
  text,
  className = 'ow-markdown-copy',
  copiedLabel = '已复制',
  copyLabel = '复制',
  onCopyEmpty,
  onCopyError
}: MarkdownCopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    }
  }, [])

  const handleCopy = useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      const value = text.trim()
      if (!value) {
        onCopyEmpty?.()
        return
      }
      try {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
        resetTimerRef.current = setTimeout(() => setCopied(false), 1600)
      } catch (error) {
        onCopyError?.(error)
      }
    },
    [onCopyEmpty, onCopyError, text]
  )

  return (
    <button
      type="button"
      className={className}
      onClick={(event) => void handleCopy(event)}
      aria-label={copied ? copiedLabel : copyLabel}
      title={copied ? copiedLabel : copyLabel}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  )
}
