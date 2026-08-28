'use client'

import { memo, useCallback, useMemo } from 'react'
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
  open?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
  placeholder?: string
  id?: string
  'aria-labelledby'?: string
  getPopupContainer?: () => HTMLElement
}

/**
 * antd Select 实现层：唯一允许 static import antd 的模块。
 */
export const ApSelectBundle = memo(function ApSelectBundle({
  className,
  onChange,
  options,
  getPopupContainer,
  ...props
}: ApSelectProps) {
  const popupContainer = useCallback(
    () => getPopupContainer?.() ?? document.body,
    [getPopupContainer]
  )
  const selectOptions = useMemo(
    () => options.map((option) => ({ value: option.value, label: option.label })),
    [options]
  )
  const handleChange = useCallback(
    (value: string) => {
      onChange?.(String(value))
    },
    [onChange]
  )

  return (
    <ConfigProvider locale={zhCN} theme={apWebAntdTheme}>
      <Select
        {...props}
        options={selectOptions}
        className={['w-full', className].filter(Boolean).join(' ')}
        classNames={{ popup: { root: 'ap-select-dropdown' } }}
        getPopupContainer={popupContainer}
        onChange={handleChange}
      />
    </ConfigProvider>
  )
})
