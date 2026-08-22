import 'highlight.js/styles/github.css'
import './markdown.scss'

import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'

import { createMarkdownComponents } from './create-markdown-components.js'
import { defaultMarkdownRehypePlugins, defaultMarkdownRemarkPlugins } from './default-plugins.js'
import type { MarkdownProps } from './types.js'

/** Markdown 渲染组件，统一 remark/rehype 插件配置 */
export function Markdown({
  content,
  className = 'ow-markdown',
  onClick,
  onCopyEmpty,
  onCopyError,
  remarkPlugins = defaultMarkdownRemarkPlugins,
  rehypePlugins = defaultMarkdownRehypePlugins,
  components: componentsOverride
}: MarkdownProps) {
  const components = useMemo(() => {
    if (componentsOverride) return componentsOverride
    return createMarkdownComponents({ onCopyEmpty, onCopyError })
  }, [componentsOverride, onCopyEmpty, onCopyError])

  return (
    <div className={className} onClick={onClick}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
