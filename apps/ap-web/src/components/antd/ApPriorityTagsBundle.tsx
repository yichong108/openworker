'use client'

import { ConfigProvider, Tag } from 'antd'
import zhCN from 'antd/locale/zh_CN'

import { PRIORITY_TAG_CLASS, TASK_PRIORITIES } from '@/lib/task-priority-style'
import type { TaskPriority } from '@/lib/task-types'

import { apWebAntdTheme } from './ap-web-antd-theme'

export type ApPriorityTagsProps = {
  value?: TaskPriority
  defaultValue?: TaskPriority
  onChange?: (value: TaskPriority) => void
  disabled?: boolean
  className?: string
  id?: string
  'aria-labelledby'?: string
}

/**
 * antd CheckableTag 实现层：优先级 Tag 单选，选中实心、未选中 plain。
 */
export function ApPriorityTagsBundle({
  className,
  onChange,
  value,
  defaultValue,
  disabled,
  id,
  'aria-labelledby': ariaLabelledBy
}: ApPriorityTagsProps) {
  const current = value ?? defaultValue ?? 'P1'

  return (
    <ConfigProvider locale={zhCN} theme={apWebAntdTheme}>
      <div
        id={id}
        role="group"
        aria-labelledby={ariaLabelledBy}
        className={['ap-priority-tags', disabled ? 'ap-priority-tags--disabled' : null, className]
          .filter(Boolean)
          .join(' ')}
      >
        {TASK_PRIORITIES.map((item) => (
          <Tag.CheckableTag
            key={item}
            checked={current === item}
            className={PRIORITY_TAG_CLASS[item]}
            onChange={(checked) => {
              if (disabled || !checked) return
              onChange?.(item)
            }}
          >
            {item}
          </Tag.CheckableTag>
        ))}
      </div>
    </ConfigProvider>
  )
}
