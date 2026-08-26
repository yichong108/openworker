'use client'

import { ConfigProvider, Radio } from 'antd'
import zhCN from 'antd/locale/zh_CN'

import { COLUMN_LABELS, STATUS_RADIO_CLASS, TASK_COLUMNS } from '@/lib/task-column-style'
import type { TaskColumn } from '@/lib/task-types'

import { apWebAntdTheme } from './ap-web-antd-theme'

export type ApStatusRadioProps = {
  value?: TaskColumn
  defaultValue?: TaskColumn
  onChange?: (value: TaskColumn) => void
  disabled?: boolean
  className?: string
  id?: string
  'aria-labelledby'?: string
}

/**
 * antd Radio.Group 实现层：任务状态单项选择，圆点颜色对齐各列强调色。
 */
export function ApStatusRadioBundle({
  className,
  onChange,
  value,
  defaultValue,
  disabled,
  id,
  'aria-labelledby': ariaLabelledBy
}: ApStatusRadioProps) {
  return (
    <ConfigProvider locale={zhCN} theme={apWebAntdTheme}>
      <Radio.Group
        id={id}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        aria-labelledby={ariaLabelledBy}
        className={['ap-status-radio-group flex flex-wrap gap-x-4 gap-y-2', className]
          .filter(Boolean)
          .join(' ')}
        onChange={(event) => onChange?.(event.target.value as TaskColumn)}
      >
        {TASK_COLUMNS.map((item) => (
          <Radio key={item} value={item} className={STATUS_RADIO_CLASS[item]}>
            {COLUMN_LABELS[item]}
          </Radio>
        ))}
      </Radio.Group>
    </ConfigProvider>
  )
}
