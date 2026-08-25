import type { Metadata } from 'next'
import { Fraunces, Outfit } from 'next/font/google'

import './globals.css'

const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap'
})

const body = Outfit({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap'
})

export const metadata: Metadata = {
  title: 'AP Web — 任务看板',
  description: '读取并维护 .agents/ap-config/work-data/tasks 下的本地任务'
}

/**
 * 应用根布局：夜间工作室风格的字体与页面壳。
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${display.variable} ${body.variable}`}>
      <body className="board-grain h-full">{children}</body>
    </html>
  )
}
