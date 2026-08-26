'use client'

import { useEffect, useState } from 'react'

import { ApSelectBundle } from './ApSelectBundle'
import type { ApSelectProps } from './ApSelectBundle'

const FIELD_FALLBACK =
  'w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none opacity-90'

/** 占位：与 FIELD 同尺寸，展示当前选项避免布局跳动。 */
export function SelectFallback({
  value,
  defaultValue,
  options,
  className,
  disabled,
  id
}: ApSelectProps) {
  const current = value ?? defaultValue ?? options[0]?.value ?? ''

  return (
    <select
      id={id}
      value={current}
      disabled={disabled}
      className={[FIELD_FALLBACK, className].filter(Boolean).join(' ')}
      aria-busy="true"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

/** antd Select 入口；客户端挂载前用原生 select 占位。 */
export function ApSelect(props: ApSelectProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <SelectFallback {...props} />
  }

  return <ApSelectBundle {...props} />
}
