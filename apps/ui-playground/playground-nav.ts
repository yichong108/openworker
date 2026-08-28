import { useEffect, useState } from 'react'

/** playground 页面：模拟数据 / BaseAgentWithAGUI / ChatSessionWithHttp / 对话框 */
export type PlaygroundPage = 'mock' | 'agent' | 'http' | 'dialog'

/**
 * 从 location.hash 解析当前页。
 *
 * @param hash - `window.location.hash`
 * @returns 页面 id
 */
export function parsePlaygroundPage(hash = window.location.hash): PlaygroundPage {
  const path = hash.replace(/^#\/?/, '')
  if (path.startsWith('agent')) return 'agent'
  if (path.startsWith('dialog')) return 'dialog'
  if (path.startsWith('http')) return 'http'
  return 'mock'
}

/**
 * 切换 playground 页面（写 hash）。
 *
 * @param page - 目标页
 */
export function setPlaygroundPage(page: PlaygroundPage): void {
  if (page === 'agent') {
    window.location.hash = '/agent'
    return
  }
  if (page === 'dialog') {
    window.location.hash = '/dialog'
    return
  }
  if (page === 'http') {
    window.location.hash = '/http'
    return
  }
  window.location.hash = '/mock'
}

/**
 * 订阅 hash 得到当前 playground 页。
 *
 * @returns 当前页
 */
export function usePlaygroundPage(): PlaygroundPage {
  const [page, setPage] = useState<PlaygroundPage>(() => parsePlaygroundPage())
  useEffect(() => {
    const onHash = () => setPage(parsePlaygroundPage())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return page
}
