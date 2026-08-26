'use client'

import { useEffect, useState } from 'react'

import { ApTimePickerBundle, type ApTimePickerProps } from './ApControlBundle'

const FIELD_FALLBACK =
  'w-full rounded-lg border border-black/10 bg-white px-2 py-1 text-xs outline-none opacity-90'

/** 占位：与 TimePicker 同尺寸，避免布局跳动。 */
export function TimePickerFallback({
  value,
  defaultValue,
  className,
  disabled,
  id,
  onChange
}: ApTimePickerProps) {
  return (
    <input
      id={id}
      type="time"
      value={value ?? defaultValue ?? ''}
      disabled={disabled ?? true}
      aria-busy="true"
      onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      className={[FIELD_FALLBACK, className].filter(Boolean).join(' ')}
    />
  )
}

/** antd TimePicker 入口；客户端挂载前用原生 time input 占位。 */
export function ApTimePicker(props: ApTimePickerProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <TimePickerFallback {...props} />
  }

  return <ApTimePickerBundle {...props} />
}
