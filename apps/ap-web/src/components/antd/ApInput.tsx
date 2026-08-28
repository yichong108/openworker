'use client'

import { lazy, Suspense, useEffect, useState } from 'react'

import type { ApInputProps } from './ApInputBundle'

const FIELD_FALLBACK =
  'w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none opacity-90'

/** 懒加载占位：与 FIELD 同尺寸，避免布局跳动。 */
export function InputFallback({
  value,
  defaultValue,
  className,
  disabled,
  id,
  name,
  type,
  placeholder,
  autoFocus,
  required,
  min,
  max,
  onChange
}: ApInputProps) {
  return (
    <input
      id={id}
      name={name}
      type={type}
      value={value}
      defaultValue={defaultValue}
      disabled={disabled ?? true}
      placeholder={placeholder}
      autoFocus={autoFocus}
      required={required}
      min={min}
      max={max}
      aria-busy="true"
      onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      className={[FIELD_FALLBACK, className].filter(Boolean).join(' ')}
    />
  )
}

const ApInputBundle = lazy(() =>
  import('./ApInputBundle').then((module) => ({
    default: module.ApInputBundle
  }))
)

/** 懒加载 antd Input，业务组件只依赖此入口。 */
export function ApInput(props: ApInputProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <InputFallback {...props} />
  }

  return (
    <Suspense fallback={<InputFallback {...props} />}>
      <ApInputBundle {...props} />
    </Suspense>
  )
}
