'use client'

import { ConfigProvider, Radio } from 'antd'
import zhCN from 'antd/locale/zh_CN'

import { PRIORITY_RADIO_CLASS, TASK_PRIORITIES } from '@/lib/task-priority-style'
import type { TaskPriority } from '@/lib/task-types'

import { apWebAntdTheme } from './ap-web-antd-theme'

export type ApPriorityRadioProps = {
  value?: TaskPriority
  defaultValue?: TaskPriority
  onChange?: (value: TaskPriority) => void
  disabled?: boolean
  className?: string
  id?: string
  'aria-labelledby'?: string
}

/**
 * antd Radio.Group 实现层：优先级单项选择，圆点颜色对齐各优先级。
 */
export function ApPriorityRadioBundle({
  className,
  onChange,
  value,
  defaultValue,
  disabled,
  id,
  'aria-labelledby': ariaLabelledBy
}: ApPriorityRadioProps) {
  return (
    <ConfigProvider locale={zhCN} theme={apWebAntdTheme}>
      <Radio.Group
        id={id}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        aria-labelledby={ariaLabelledBy}
        className={['ap-priority-radio-group flex flex-wrap gap-x-4 gap-y-2', className]
          .filter(Boolean)
          .join(' ')}
        onChange={(event) => onChange?.(event.target.value as TaskPriority)}
      >
        {TASK_PRIORITIES.map((item) => (
          <Radio key={item} value={item} className={PRIORITY_RADIO_CLASS[item]}>
            {item}
          </Radio>
        ))}
      </Radio.Group>
    </ConfigProvider>
  )
}
