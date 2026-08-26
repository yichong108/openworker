'use client'

import { ConfigProvider, Select } from 'antd'
import zhCN from 'antd/locale/zh_CN'

import { apWebAntdTheme } from './ap-web-antd-theme'

export type ApSelectProps = {
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  options: { value: string; label: string }[]
  disabled?: boolean
  loading?: boolean
  className?: string
  placeholder?: string
  id?: string
}

/**
 * antd Select 实现层：唯一允许 static import antd 的模块。
 */
export function ApSelectBundle({ className, onChange, ...props }: ApSelectProps) {
  return (
    <ConfigProvider locale={zhCN} theme={apWebAntdTheme}>
      <Select
        {...props}
        id={props.id}
        className={['w-full', className].filter(Boolean).join(' ')}
        popupClassName="ap-select-dropdown"
        getPopupContainer={() => document.body}
        onChange={(value) => onChange?.(String(value))}
      />
    </ConfigProvider>
  )
}
