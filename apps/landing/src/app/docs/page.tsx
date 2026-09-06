'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import type { Components } from 'react-markdown'
import 'highlight.js/styles/github-dark.css'

import introductionContent from './markdown/getting-started/introduction.md'
import installationContent from './markdown/getting-started/installation.md'
import quickStartContent from './markdown/getting-started/quick-start.md'
import settingsContent from './markdown/configuration/settings.md'

interface DocSection {
  id: string
  title: string
  items: DocItem[]
}

interface DocItem {
  id: string
  title: string
  content: string
}

const docSections: DocSection[] = [
  {
    id: 'getting-started',
    title: '快速开始',
    items: [
      {
        id: 'introduction',
        title: '简介',
        content: introductionContent
      },
      {
        id: 'installation',
        title: '安装指南',
        content: installationContent
      },
      {
        id: 'quick-start',
        title: '快速开始',
        content: quickStartContent
      }
    ]
  },
  {
    id: 'configuration',
    title: '配置',
    items: [
      {
        id: 'settings',
        title: '应用设置',
        content: settingsContent
      }
    ]
  }
]

/** 扁平化所有文档条目，用于上一页/下一页导航 */
const flatItems = docSections.flatMap((section) =>
  section.items.map((item) => ({ ...item, sectionId: section.id, sectionTitle: section.title }))
)

function findSectionByItemId(itemId: string): DocSection | undefined {
  return docSections.find((section) => section.items.some((item) => item.id === itemId))
}

/** 代码块复制按钮 - 使用 ref 在点击时获取纯文本 */
function CopyButton({ preRef }: { preRef: React.RefObject<HTMLPreElement> }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      const text = preRef.current?.textContent || ''
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      className={`copy-btn ${copied ? 'copied' : ''}`}
      onClick={handleCopy}
      aria-label={copied ? '已复制' : '复制代码'}
    >
      {copied ? (
        <>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          已复制
        </>
      ) : (
        <>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          复制
        </>
      )}
    </button>
  )
}

/** 代码块组件 - 处理 pre 标签、语言标签和复制按钮 */
function CodeBlock({ children, ...props }: React.ComponentPropsWithoutRef<'pre'>) {
  const preRef = useRef<HTMLPreElement>(null)

  // 提取语言标签
  const childArray = Array.isArray(children) ? children : [children]
  const codeChild = childArray.find(
    (child): child is any =>
      child &&
      typeof child === 'object' &&
      'props' in child &&
      child.props?.node?.tagName === 'code'
  )
  const codeProps = codeChild?.props || {}
  const codeClassName: string = codeProps.className || ''
  const langMatch = codeClassName.match(/language-(\w+)/)
  const language = langMatch ? langMatch[1] : ''

  return (
    <div className="code-block-wrapper not-prose">
      {language && <span className="code-lang-label">{language}</span>}
      <CopyButton preRef={preRef} />
      <pre ref={preRef} className={codeClassName} {...props}>
        {children}
      </pre>
    </div>
  )
}

/** 自定义 ReactMarkdown 组件映射 */
const markdownComponents: Components = {
  pre: (props) => <CodeBlock {...props} />,
  a: ({ href, children, ...props }) => {
    if (href?.startsWith('#')) {
      const itemId = href.slice(1)
      const section = findSectionByItemId(itemId)
      if (section) {
        return (
          <button
            type="button"
            className="font-medium text-[var(--teal)] hover:underline"
            onClick={() => {
              // 触发切换并滚动到顶部
              const mainArea = document.getElementById('doc-main-area')
              if (mainArea) mainArea.scrollTo({ top: 0, behavior: 'smooth' })
              const event = new CustomEvent('ow-doc-select', {
                detail: { sectionId: section.id, itemId }
              })
              window.dispatchEvent(event)
            }}
          >
            {children}
          </button>
        )
      }
    }
    return (
      <a
        href={href}
        target={href?.startsWith('http') ? '_blank' : undefined}
        rel={href?.startsWith('http') ? 'noreferrer' : undefined}
        {...props}
      >
        {children}
      </a>
    )
  }
}

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('getting-started')
  const [activeItem, setActiveItem] = useState('introduction')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const mainRef = useRef<HTMLDivElement>(null)

  // 监听 markdown 内部的 hash 点击事件
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { sectionId: string; itemId: string }
      if (detail) {
        selectDoc(detail.sectionId, detail.itemId)
      }
    }
    window.addEventListener('ow-doc-select', handler)
    return () => window.removeEventListener('ow-doc-select', handler)
  }, [])

  // 初始加载和 hash 变化
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace(/^#/, '')
      if (!hash) return
      const section = findSectionByItemId(hash)
      if (!section) return
      setActiveSection(section.id)
      setActiveItem(hash)
    }

    applyHash()
    window.addEventListener('hashchange', applyHash)
    return () => window.removeEventListener('hashchange', applyHash)
  }, [])

  // 切换文档时滚动到顶部
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
    setSidebarOpen(false)
  }, [activeItem])

  /** 切换当前文档条目 */
  const selectDoc = (sectionId: string, itemId: string) => {
    setActiveSection(sectionId)
    setActiveItem(itemId)
    if (window.location.hash !== `#${itemId}`) {
      window.history.replaceState(null, '', `#${itemId}`)
    }
  }

  const activeSectionData = docSections.find((s) => s.id === activeSection)
  const activeItemData = activeSectionData?.items.find((i) => i.id === activeItem)

  // 上一页/下一页
  const currentIndex = flatItems.findIndex((item) => item.id === activeItem)
  const prevItem = currentIndex > 0 ? flatItems[currentIndex - 1] : null
  const nextItem = currentIndex < flatItems.length - 1 ? flatItems[currentIndex + 1] : null

  return (
    <div className="min-h-screen bg-white text-[var(--ink)]">
      {/* 顶部导航 - 纯白，无毛玻璃 */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            {/* 移动端菜单按钮 */}
            <button
              type="button"
              className="lg:hidden flex h-9 w-9 items-center justify-center rounded-md text-[var(--ink-soft)] transition hover:bg-gray-100 hover:text-[var(--ink)]"
              onClick={() => setSidebarOpen(true)}
              aria-label="打开菜单"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <Link href="/" className="font-display text-xl font-semibold tracking-tight">
              OpenWorker
            </Link>
          </div>
          <nav className="flex gap-6 text-sm">
            <Link
              href="/"
              className="hidden sm:block text-[var(--ink-soft)] transition hover:text-[var(--ink)]"
            >
              首页
            </Link>
            <Link href="/docs" className="font-medium text-[var(--ink)]">
              文档
            </Link>
          </nav>
        </div>
      </header>

      {/* 移动端侧边栏遮罩 */}
      {sidebarOpen && (
        <div
          className="mobile-sidebar-overlay fixed inset-0 z-40 bg-[rgba(12,18,34,0.4)] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 主布局 */}
      <div className="fixed bottom-0 left-0 right-0 top-16 overflow-hidden">
        <div className="flex h-full">
          {/* 侧边栏 - 纯白，细边框 */}
          <aside
            className={`
              doc-sidebar fixed lg:static z-40 lg:z-auto h-full w-72 lg:w-64 flex-shrink-0
              overflow-y-auto border-r border-gray-200
              transition-transform duration-300 ease-out
              ${sidebarOpen ? 'mobile-sidebar translate-x-0' : '-translate-x-full lg:translate-x-0'}
            `}
          >
            <div className="p-5 lg:p-4">
              {docSections.map((section) => (
                <div key={section.id} className="mb-8">
                  <h3 className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-[var(--ink-soft)]">
                    {section.title}
                  </h3>
                  <ul className="space-y-0.5">
                    {section.items.map((item) => {
                      const isActive = activeItem === item.id
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => selectDoc(section.id, item.id)}
                            className={`sidebar-nav-item w-full rounded-md py-1.5 pr-3 text-left text-sm transition-colors ${
                              isActive
                                ? 'active font-medium'
                                : 'text-[var(--ink-soft)] hover:bg-gray-100 hover:text-[var(--ink)]'
                            }`}
                          >
                            {item.title}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </aside>

          {/* 主内容区 - 纯白 */}
          <main ref={mainRef} id="doc-main-area" className="doc-content-bg flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl px-8 py-12">
              {/* 面包屑 - 极简 */}
              <div className="mb-8 flex items-center gap-1.5 text-xs text-gray-500">
                <span>{activeSectionData?.title}</span>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                <span className="text-[var(--ink)]">{activeItemData?.title}</span>
              </div>

              {/* 文档正文 - 无卡片，直接渲染 */}
              <article className="doc-prose">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight, rehypeRaw]}
                  components={markdownComponents}
                >
                  {activeItemData?.content || ''}
                </ReactMarkdown>
              </article>

              {/* 上一页/下一页导航 */}
              <div className="mt-12 grid gap-4 sm:grid-cols-2">
                {prevItem ? (
                  <button
                    type="button"
                    onClick={() => selectDoc(prevItem.sectionId, prevItem.id)}
                    className="group rounded-lg border border-gray-200 bg-white px-5 py-4 text-left transition hover:border-[var(--teal)] hover:bg-gray-50"
                  >
                    <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                      上一页
                    </div>
                    <div className="mt-1 truncate text-sm font-medium text-[var(--ink)] group-hover:text-[var(--teal)]">
                      {prevItem.title}
                    </div>
                  </button>
                ) : null}
                {nextItem ? (
                  <button
                    type="button"
                    onClick={() => selectDoc(nextItem.sectionId, nextItem.id)}
                    className="group rounded-lg border border-gray-200 bg-white px-5 py-4 text-left transition hover:border-[var(--teal)] hover:bg-gray-50 sm:text-right"
                  >
                    <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                      下一页
                    </div>
                    <div className="mt-1 truncate text-sm font-medium text-[var(--ink)] group-hover:text-[var(--teal)]">
                      {nextItem.title}
                    </div>
                  </button>
                ) : null}
              </div>

              {/* Footer */}
              <footer className="mt-16 border-t border-gray-200 pt-8 text-center text-sm text-gray-500">
                OpenWorker · MIT License ·{' '}
                <a
                  href="https://github.com/yichong108/openworker"
                  className="hover:text-[var(--ink)]"
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub
                </a>
              </footer>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
