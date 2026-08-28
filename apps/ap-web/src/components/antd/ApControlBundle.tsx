'use client'

import { ConfigProvider, InputNumber, Switch, TimePicker } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import dayjs, { type Dayjs } from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'

import { apWebAntdTheme } from './ap-web-antd-theme'

dayjs.extend(customParseFormat)

const TIME_FORMAT = 'HH:mm'

export type ApSwitchProps = {
  checked?: boolean
  defaultChecked?: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  className?: string
  id?: string
}

export type ApTimePickerProps = {
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  disabled?: boolean
  className?: string
  id?: string
  size?: 'small' | 'middle' | 'large'
}

export type ApInputNumberProps = {
  value?: number
  defaultValue?: number
  onChange?: (value: number) => void
  min?: number
  max?: number
  disabled?: boolean
  className?: string
  id?: string
  size?: 'small' | 'middle' | 'large'
}

function parseTime(value?: string): Dayjs | null {
  if (!value) return null
  const parsed = dayjs(value, TIME_FORMAT, true)
  return parsed.isValid() ? parsed : null
}

function AntdRoot({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider locale={zhCN} theme={apWebAntdTheme}>
      {children}
    </ConfigProvider>
  )
}

/** antd Switch 实现层。 */
export function ApSwitchBundle({ className, onChange, ...props }: ApSwitchProps) {
  return (
    <AntdRoot>
      <Switch
        {...props}
        className={['ap-switch', className].filter(Boolean).join(' ')}
        onChange={(checked) => onChange?.(checked)}
      />
    </AntdRoot>
  )
}

/** antd TimePicker 实现层；value/onChange 使用 HH:mm 字符串。 */
export function ApTimePickerBundle({
  className,
  onChange,
  value,
  defaultValue,
  size = 'small',
  ...props
}: ApTimePickerProps) {
  return (
    <AntdRoot>
      <TimePicker
        {...props}
        allowClear={false}
        size={size}
        format={TIME_FORMAT}
        value={parseTime(value)}
        defaultValue={parseTime(defaultValue)}
        needConfirm={false}
        classNames={{ popup: { root: 'ap-time-picker-dropdown' } }}
        className={['w-full', className].filter(Boolean).join(' ')}
        onChange={(time) => onChange?.(time ? time.format(TIME_FORMAT) : '')}
      />
    </AntdRoot>
  )
}

/** antd InputNumber 实现层。 */
export function ApInputNumberBundle({
  className,
  onChange,
  min,
  max,
  size = 'small',
  ...props
}: ApInputNumberProps) {
  return (
    <AntdRoot>
      <InputNumber
        {...props}
        min={min}
        max={max}
        size={size}
        className={['w-full', className].filter(Boolean).join(' ')}
        onChange={(next) => {
          if (next === null) return
          const clamped =
            min !== undefined || max !== undefined
              ? Math.max(
                  min ?? Number.NEGATIVE_INFINITY,
                  Math.min(max ?? Number.POSITIVE_INFINITY, next)
                )
              : next
          onChange?.(clamped)
        }}
      />
    </AntdRoot>
  )
}
