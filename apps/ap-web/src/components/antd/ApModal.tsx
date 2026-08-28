'use client'

import { lazy, Suspense, useEffect, useState } from 'react'

import type { ApModalProps } from './ApModalBundle'

const ApModalBundle = lazy(() =>
  import('./ApModalBundle').then((module) => ({
    default: module.ApModalBundle
  }))
)

/** 懒加载 antd Modal，业务弹窗统一经此入口。 */
export function ApModal(props: ApModalProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <Suspense fallback={null}>
      <ApModalBundle {...props} />
    </Suspense>
  )
}

export type { ApModalProps } from './ApModalBundle'
