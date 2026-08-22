import type { MouseEventHandler, ReactNode } from 'react'
import type { Components, Options } from 'react-markdown'

export type MarkdownCopyCallbacks = {
  onCopyEmpty?: () => void
  onCopyError?: (error: unknown) => void
}

export type MarkdownProps = MarkdownCopyCallbacks & {
  content: string
  className?: string
  onClick?: MouseEventHandler<HTMLDivElement>
  remarkPlugins?: Options['remarkPlugins']
  rehypePlugins?: Options['rehypePlugins']
  components?: Components
}

export type MarkdownCodeBlockProps = MarkdownCopyCallbacks & {
  children?: ReactNode
  className?: string
}

export type MarkdownCopyButtonProps = MarkdownCopyCallbacks & {
  /** 要写入剪贴板的完整 Markdown 原文 */
  text: string
  className?: string
  copiedLabel?: string
  copyLabel?: string
}
