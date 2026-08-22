import type { Components } from 'react-markdown'

import { MarkdownCodeBlock } from './MarkdownCodeBlock.js'
import type { MarkdownCopyCallbacks } from './types.js'

/**
 * Markdown 自定义节点映射。
 *
 * 为代码块增加右上角复制、为表格增加横向滚动外壳，
 * 其余节点沿用默认渲染并由 SCSS 控制观感。
 */
export function createMarkdownComponents(options?: MarkdownCopyCallbacks): Components {
  const { onCopyEmpty, onCopyError } = options ?? {}

  return {
    pre({ children }) {
      return (
        <MarkdownCodeBlock onCopyEmpty={onCopyEmpty} onCopyError={onCopyError}>
          {children}
        </MarkdownCodeBlock>
      )
    },
    table({ children }) {
      return (
        <div className="ow-markdown-table-wrap">
          <table>{children}</table>
        </div>
      )
    }
  }
}
