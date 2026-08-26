'use client'

import { useEffect, useState } from 'react'

import { COLUMN_LABELS, TASK_COLUMNS } from '@/lib/task-column-style'

import { ApStatusRadioBundle, type ApStatusRadioProps } from './ApStatusRadioBundle'

/** 占位：原生 radio，避免布局跳动。 */
function StatusRadioFallback({
  value,
  defaultValue,
  onChange,
  disabled,
  className,
  id,
  'aria-labelledby': ariaLabelledBy
}: ApStatusRadioProps) {
  const current = value ?? defaultValue ?? 'todo'

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
      {TASK_COLUMNS.map((item) => (
        <label key={item} className="inline-flex items-center gap-1.5">
          <input
            type="radio"
            name={id ?? 'status'}
            value={item}
            checked={current === item}
            disabled={disabled ?? true}
            onChange={() => onChange?.(item)}
          />
          {COLUMN_LABELS[item]}
        </label>
      ))}
    </div>
  )
}

/** antd 任务状态 Radio 入口；客户端挂载前用原生 radio 占位。 */
export function ApStatusRadio(props: ApStatusRadioProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <StatusRadioFallback {...props} />
  }

  return <ApStatusRadioBundle {...props} />
}

export type { ApStatusRadioProps } from './ApStatusRadioBundle'
