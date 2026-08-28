'use client'

import dynamic from 'next/dynamic'
import { useEffect } from 'react'

import type { ApModalProps } from './ApModalBundle'

const ApModalBundle = dynamic(
  () => import('./ApModalBundle').then((module) => ({ default: module.ApModalBundle })),
  { ssr: false }
)

/** 懒加载 antd Modal，业务弹窗统一经此入口。 */
export function ApModal(props: ApModalProps) {
  useEffect(() => {
    void import('./ApModalBundle')
  }, [])

  return <ApModalBundle {...props} />
}

export type { ApModalProps } from './ApModalBundle'
