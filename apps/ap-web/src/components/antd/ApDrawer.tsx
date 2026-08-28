'use client'

import { lazy, Suspense, useEffect, useState } from 'react'

import type { ApDrawerProps } from './ApDrawerBundle'

const ApDrawerBundle = lazy(() =>
  import('./ApDrawerBundle').then((module) => ({
    default: module.ApDrawerBundle
  }))
)

/** 懒加载 antd Drawer，业务侧滑面板统一经此入口。 */
export function ApDrawer(props: ApDrawerProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <Suspense fallback={null}>
      <ApDrawerBundle {...props} />
    </Suspense>
  )
}

export type { ApDrawerProps } from './ApDrawerBundle'
