import type { Metadata } from 'next'
import { Source_Sans_3, Syne } from 'next/font/google'
import './globals.css'

const display = Syne({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap'
})

const body = Source_Sans_3({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap'
})

export const metadata: Metadata = {
  title: 'OpenWorker — 日常智能助手',
  description:
    '本地优先的 AI 伙伴：对话、工作区任务、Skills 与知识库，帮你处理日常信息、做出更好选择。'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  )
}
