'use client'

import { useEffect, useState } from 'react'

import { ApSwitchBundle, type ApSwitchProps } from './ApControlBundle'

/** 占位：与 Switch 同尺寸，避免布局跳动。 */
export function SwitchFallback({ checked, className, disabled, onChange }: ApSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked ?? false}
      disabled={disabled ?? true}
      aria-busy="true"
      onClick={() => onChange?.(!checked)}
      className={[
        'relative h-5 w-9 shrink-0 rounded-full transition',
        checked ? 'bg-[var(--teal)]' : 'bg-black/20',
        className
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
          checked ? 'left-4' : 'left-0.5'
        }`}
      />
    </button>
  )
}

/** antd Switch 入口；客户端挂载前用原生 switch 占位。 */
export function ApSwitch(props: ApSwitchProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <SwitchFallback {...props} />
  }

  return <ApSwitchBundle {...props} />
}
