'use client'

import { ConfigProvider, Input } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import type { KeyboardEventHandler } from 'react'

import { apWebAntdTheme } from './ap-web-antd-theme'

export type ApInputProps = {
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  type?: React.HTMLInputTypeAttribute
  placeholder?: string
  disabled?: boolean
  className?: string
  id?: string
  name?: string
  autoFocus?: boolean
  required?: boolean
  min?: number | string
  max?: number | string
}

export type ApTextAreaProps = {
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  rows?: number
  placeholder?: string
  disabled?: boolean
  className?: string
  id?: string
  name?: string
  autoFocus?: boolean
  required?: boolean
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>
}

/**
 * antd Input 实现层：唯一允许 static import antd Input 的模块。
 */
export function ApInputBundle({ className, onChange, ...props }: ApInputProps) {
  return (
    <ConfigProvider locale={zhCN} theme={apWebAntdTheme}>
      <Input
        {...props}
        className={['w-full', className].filter(Boolean).join(' ')}
        onChange={(event) => onChange?.(event.target.value)}
      />
    </ConfigProvider>
  )
}

/**
 * antd Input.TextArea 实现层。
 */
export function ApTextAreaBundle({ className, onChange, ...props }: ApTextAreaProps) {
  return (
    <ConfigProvider locale={zhCN} theme={apWebAntdTheme}>
      <Input.TextArea
        {...props}
        className={['w-full', className].filter(Boolean).join(' ')}
        onChange={(event) => onChange?.(event.target.value)}
      />
    </ConfigProvider>
  )
}
