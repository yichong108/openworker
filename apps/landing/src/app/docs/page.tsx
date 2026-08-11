'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import 'highlight.js/styles/github-dark.css'

import introductionContent from './markdown/getting-started/introduction.md'
import installationContent from './markdown/getting-started/installation.md'
import quickStartContent from './markdown/getting-started/quick-start.md'
import mcpSupportContent from './markdown/features/mcp-support.md'
import workspaceContent from './markdown/features/workspace.md'
import agentConfigContent from './markdown/configuration/agent-config.md'
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
    id: 'features',
    title: '功能特性',
    items: [
      {
        id: 'mcp-support',
        title: 'MCP 协议支持',
        content: mcpSupportContent
      },
      {
        id: 'workspace',
        title: 'Workspace 管理',
        content: workspaceContent
      }
    ]
  },
  {
    id: 'configuration',
    title: '配置',
    items: [
      {
        id: 'agent-config',
        title: 'Agent 配置',
        content: agentConfigContent
      },
      {
        id: 'settings',
        title: '应用设置',
        content: settingsContent
      }
    ]
  }
]

/**
 * 根据文档条目 id 查找所属分组，供侧边栏高亮与 hash 路由使用
 *
 * @param itemId - 文档条目 id（如 for-users）
 * @returns 所属分组，未找到时为 undefined
 */
function findSectionByItemId(itemId: string): DocSection | undefined {
  return docSections.find((section) => section.items.some((item) => item.id === itemId))
}

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('getting-started')
  const [activeItem, setActiveItem] = useState('introduction')

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

  /**
   * 切换当前文档条目，并同步更新 URL hash，便于首页深链与分享
   *
   * @param sectionId - 侧边栏分组 id
   * @param itemId - 文档条目 id
   */
  const selectDoc = (sectionId: string, itemId: string) => {
    setActiveSection(sectionId)
    setActiveItem(itemId)
    if (window.location.hash !== `#${itemId}`) {
      window.history.replaceState(null, '', `#${itemId}`)
    }
  }

  const activeSectionData = docSections.find((s) => s.id === activeSection)
  const activeItemData = activeSectionData?.items.find((i) => i.id === activeItem)

  return (
    <div className="min-h-screen bg-[var(--mist)] text-[var(--ink)]">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-[var(--line)] bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="font-display text-xl font-semibold tracking-tight">
              OpenWorker
            </Link>
            <nav className="flex gap-6 text-sm">
              <Link href="/" className="text-[var(--ink-soft)] hover:text-[var(--ink)]">
                首页
              </Link>
              <Link href="/docs" className="font-medium text-[var(--ink)]">
                文档
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <div className="fixed bottom-0 left-0 right-0 top-16 overflow-hidden">
        <div className="flex h-full">
          <aside className="w-64 flex-shrink-0 overflow-y-auto border-r border-[var(--line)] bg-white">
            <div className="p-4">
              {docSections.map((section) => (
                <div key={section.id} className="mb-6">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--ink-soft)]">
                    {section.title}
                  </h3>
                  <ul className="space-y-1">
                    {section.items.map((item) => (
                      <li key={item.id}>
                        <button
                          onClick={() => selectDoc(section.id, item.id)}
                          className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                            activeItem === item.id
                              ? 'bg-[rgba(8,127,140,0.1)] font-medium text-[var(--teal)]'
                              : 'text-[var(--ink-soft)] hover:bg-[var(--mist)]'
                          }`}
                        >
                          {item.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </aside>

          <main className="flex-1 overflow-y-auto bg-[var(--mist)]">
            <div className="mx-auto max-w-4xl px-8 py-8">
              <article className="prose prose-lg max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-[var(--ink)] prose-h1:mb-6 prose-h1:border-b prose-h1:border-[var(--line)] prose-h1:pb-4 prose-h1:font-display prose-h1:text-3xl prose-h2:mb-4 prose-h2:mt-8 prose-h2:text-2xl prose-h3:mb-3 prose-h3:mt-6 prose-h3:text-xl prose-p:mb-4 prose-p:leading-relaxed prose-p:text-[var(--ink-soft)] prose-a:font-medium prose-a:text-[var(--teal)] prose-a:no-underline hover:prose-a:underline prose-strong:text-[var(--ink)] prose-code:rounded prose-code:bg-white prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-sm prose-code:text-[var(--teal)] prose-pre:mb-6 prose-pre:overflow-x-auto prose-pre:rounded-lg prose-pre:bg-[var(--panel)] prose-pre:p-4 prose-pre:text-gray-100 prose-ul:mb-4 prose-ul:list-disc prose-ul:pl-6 prose-ol:mb-4 prose-ol:list-decimal prose-ol:pl-6 prose-li:mb-2 prose-li:text-[var(--ink-soft)] prose-blockquote:mb-4 prose-blockquote:border-l-4 prose-blockquote:border-[var(--teal)] prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-[var(--ink-soft)] prose-hr:my-8 prose-hr:border-[var(--line)] prose-table:mb-6 prose-th:border-b prose-th:border-[var(--line)] prose-th:pb-2 prose-th:pr-4 prose-th:text-left prose-th:font-semibold prose-th:text-[var(--ink)] prose-td:border-b prose-td:border-[var(--line)] prose-td:py-3 prose-td:pr-4 prose-td:text-[var(--ink-soft)]">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight, rehypeRaw]}
                  components={{
                    a: ({ href, children, ...props }) => {
                      if (href?.startsWith('#')) {
                        const itemId = href.slice(1)
                        const section = findSectionByItemId(itemId)
                        if (section) {
                          return (
                            <button
                              type="button"
                              className="font-medium text-[var(--teal)] hover:underline"
                              onClick={() => selectDoc(section.id, itemId)}
                            >
                              {children}
                            </button>
                          )
                        }
                      }
                      return (
                        <a href={href} {...props}>
                          {children}
                        </a>
                      )
                    }
                  }}
                >
                  {activeItemData?.content || ''}
                </ReactMarkdown>
              </article>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
