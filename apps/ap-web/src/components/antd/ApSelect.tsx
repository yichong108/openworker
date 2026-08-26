'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'

import type { ApSelectProps } from './ApSelectBundle'

const FIELD_FALLBACK =
  'w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none opacity-90'

/** 懒加载占位：与 FIELD 同尺寸，展示当前选项避免布局跳动。 */
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
      disabled={disabled ?? true}
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

const ApSelectLazy = dynamic(
  () => import('./ApSelectBundle').then((module) => ({ default: module.ApSelectBundle })),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-[38px] w-full animate-pulse rounded-lg border border-black/10 bg-black/[0.03]"
        aria-busy="true"
      />
    )
  }
)

/** 懒加载 antd Select，业务组件只依赖此入口。 */
export function ApSelect(props: ApSelectProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <SelectFallback {...props} />
  }

  return <ApSelectLazy {...props} />
}
