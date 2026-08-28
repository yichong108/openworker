'use client'

import { lazy, Suspense, useEffect, useState } from 'react'

import type { ApTextAreaProps } from './ApInputBundle'

const FIELD_FALLBACK =
  'w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none opacity-90'

/** 懒加载占位：与 FIELD 同尺寸，避免布局跳动。 */
export function TextAreaFallback({
  value,
  defaultValue,
  className,
  disabled,
  id,
  name,
  rows,
  placeholder,
  autoFocus,
  required,
  onChange,
  onKeyDown
}: ApTextAreaProps) {
  return (
    <textarea
      id={id}
      name={name}
      value={value}
      defaultValue={defaultValue}
      disabled={disabled ?? true}
      rows={rows}
      placeholder={placeholder}
      autoFocus={autoFocus}
      required={required}
      aria-busy="true"
      onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      onKeyDown={onKeyDown}
      className={[FIELD_FALLBACK, className].filter(Boolean).join(' ')}
    />
  )
}

const ApTextAreaBundle = lazy(() =>
  import('./ApInputBundle').then((module) => ({
    default: module.ApTextAreaBundle
  }))
)

/** 懒加载 antd Input.TextArea，业务组件只依赖此入口。 */
export function ApTextArea(props: ApTextAreaProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <TextAreaFallback {...props} />
  }

  return (
    <Suspense fallback={<TextAreaFallback {...props} />}>
      <ApTextAreaBundle {...props} />
    </Suspense>
  )
}
