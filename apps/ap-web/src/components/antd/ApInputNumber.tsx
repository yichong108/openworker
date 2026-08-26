'use client'

import { useEffect, useState } from 'react'

import { ApInputNumberBundle, type ApInputNumberProps } from './ApControlBundle'

const FIELD_FALLBACK =
  'w-full rounded-lg border border-black/10 bg-white px-2 py-1 text-xs outline-none opacity-90'

/** 占位：与 InputNumber 同尺寸，避免布局跳动。 */
export function InputNumberFallback({
  value,
  defaultValue,
  className,
  disabled,
  id,
  min,
  max,
  onChange
}: ApInputNumberProps) {
  return (
    <input
      id={id}
      type="number"
      value={value ?? defaultValue ?? ''}
      disabled={disabled ?? true}
      min={min}
      max={max}
      aria-busy="true"
      onChange={
        onChange
          ? (event) =>
              onChange(Math.max(min ?? 1, Math.min(max ?? 99, Number(event.target.value) || 1)))
          : undefined
      }
      className={[FIELD_FALLBACK, className].filter(Boolean).join(' ')}
    />
  )
}

/** antd InputNumber 入口；客户端挂载前用原生 number input 占位。 */
export function ApInputNumber(props: ApInputNumberProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <InputNumberFallback {...props} />
  }

  return <ApInputNumberBundle {...props} />
}
