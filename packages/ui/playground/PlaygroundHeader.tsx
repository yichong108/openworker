import { Segmented } from 'antd'
import type { ReactNode } from 'react'

import { setPlaygroundPage, usePlaygroundPage, type PlaygroundPage } from './playground-nav'

const PAGE_OPTIONS: { label: string; value: PlaygroundPage }[] = [
  { label: '模拟数据', value: 'mock' },
  { label: 'Base Agent', value: 'agent' },
  { label: 'HTTP 封装', value: 'http' }
]

type PlaygroundHeaderProps = {
  /** 当前页专属控件（场景切换、清空等） */
  extra?: ReactNode
  hint: string
}

/**
 * playground 顶栏：标题、页面切换、当前页控件、提示。
 *
 * @param props - extra 与 hint
 */
export function PlaygroundHeader({ extra, hint }: PlaygroundHeaderProps) {
  const page = usePlaygroundPage()
  return (
    <header className="ow-ui-playground-bar">
      <span className="ow-ui-playground-title">ChatSession 预览</span>
      <Segmented
        size="small"
        value={page}
        onChange={(value) => setPlaygroundPage(value as PlaygroundPage)}
        options={PAGE_OPTIONS}
      />
      {extra}
      <span className="ow-ui-playground-hint">{hint}</span>
    </header>
  )
}
