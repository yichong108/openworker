'use client'

import { useEffect, useState } from 'react'

import { TASK_PRIORITIES } from '@/lib/task-priority-style'

import { ApPriorityRadioBundle, type ApPriorityRadioProps } from './ApPriorityRadioBundle'

/** 占位：原生 radio，避免布局跳动。 */
function PriorityRadioFallback({
  value,
  defaultValue,
  onChange,
  disabled,
  className,
  id,
  'aria-labelledby': ariaLabelledBy
}: ApPriorityRadioProps) {
  const current = value ?? defaultValue ?? 'P1'

  return (
    <div
      id={id}
      role="radiogroup"
      aria-labelledby={ariaLabelledBy}
      aria-busy="true"
      className={['flex flex-wrap gap-x-4 gap-y-2 text-sm text-[var(--ink)]', className]
        .filter(Boolean)
        .join(' ')}
    >
      {TASK_PRIORITIES.map((item) => (
        <label key={item} className="inline-flex items-center gap-1.5">
          <input
            type="radio"
            name={id ?? 'priority'}
            value={item}
            checked={current === item}
            disabled={disabled ?? true}
            onChange={() => onChange?.(item)}
          />
          {item}
        </label>
      ))}
    </div>
  )
}

/** antd 优先级 Radio 入口；客户端挂载前用原生 radio 占位。 */
export function ApPriorityRadio(props: ApPriorityRadioProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <PriorityRadioFallback {...props} />
  }

  return <ApPriorityRadioBundle {...props} />
}

export type { ApPriorityRadioProps } from './ApPriorityRadioBundle'
