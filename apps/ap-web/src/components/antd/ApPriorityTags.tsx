'use client'

import { useEffect, useState } from 'react'

import { TASK_PRIORITIES } from '@/lib/task-priority-style'

import { ApPriorityTagsBundle, type ApPriorityTagsProps } from './ApPriorityTagsBundle'

/** 占位：避免布局跳动。 */
function PriorityTagsFallback({
  value,
  defaultValue,
  onChange,
  disabled,
  className,
  id,
  'aria-labelledby': ariaLabelledBy
}: ApPriorityTagsProps) {
  const current = value ?? defaultValue ?? 'P1'

  return (
    <div
      id={id}
      role="group"
      aria-labelledby={ariaLabelledBy}
      aria-busy="true"
      className={['ap-priority-tags flex flex-wrap gap-5', className].filter(Boolean).join(' ')}
    >
      {TASK_PRIORITIES.map((item) => (
        <button
          key={item}
          type="button"
          disabled={disabled ?? true}
          aria-pressed={current === item}
          onClick={() => onChange?.(item)}
          className={`rounded-full border px-2 py-px text-[11px] font-semibold leading-[18px] ${
            current === item ? 'border-black/20 bg-black/10' : 'border-black/15 bg-transparent'
          }`}
        >
          {item}
        </button>
      ))}
    </div>
  )
}

/** antd 优先级 Tag 入口；客户端挂载前用占位按钮。 */
export function ApPriorityTags(props: ApPriorityTagsProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <PriorityTagsFallback {...props} />
  }

  return <ApPriorityTagsBundle {...props} />
}

export type { ApPriorityTagsProps } from './ApPriorityTagsBundle'
