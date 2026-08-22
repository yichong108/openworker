import React from 'react'

/** 递归收集 React 节点中的纯文本，用于代码块复制 */
export function collectTextContent(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(collectTextContent).join('')
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return collectTextContent(node.props.children)
  }
  return ''
}
