import { useEffect, useState } from 'react'

/** playground 页面：模拟数据 / BaseAgentWithAGUI */
export type PlaygroundPage = 'mock' | 'agent'

/**
 * 从 location.hash 解析当前页。
 *
 * @param hash - `window.location.hash`
 * @returns 页面 id
 */
export function parsePlaygroundPage(hash = window.location.hash): PlaygroundPage {
  const path = hash.replace(/^#\/?/, '')
  return path.startsWith('agent') ? 'agent' : 'mock'
}

/**
 * 切换 playground 页面（写 hash）。
 *
 * @param page - 目标页
 */
export function setPlaygroundPage(page: PlaygroundPage): void {
  window.location.hash = page === 'agent' ? '/agent' : '/mock'
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
