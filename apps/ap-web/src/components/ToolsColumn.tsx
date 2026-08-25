'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

const PAGE_SIZE = 20
const STORAGE_KEY = 'ap-web-toolbox-skills'

type CatalogSkill = {
  name: string
  summary: string
}

type ToolsColumnProps = {
  onAiAuthError?: (message: string) => void
}

/**
 * 从 localStorage 读出已加入工具集的 skill 名。
 *
 * @returns 名称数组
 */
function readToolbox(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

/**
 * 把工具集列表写入 localStorage。
 *
 * @param names - skill 名
 */
function writeToolbox(names: string[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(names))
}

/**
 * 工具集列：从 `.agents/skills` 挑选 skill，并用 Cursor SDK 开始/停止执行。
 */
export function ToolsColumn({ onAiAuthError }: ToolsColumnProps) {
  const [catalog, setCatalog] = useState<CatalogSkill[]>([])
  const [toolbox, setToolbox] = useState<string[]>([])
  const [running, setRunning] = useState<string[]>([])
  const [page, setPage] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ name: string; x: number; y: number } | null>(
    null
  )

  useEffect(() => {
    setToolbox(readToolbox())
  }, [])

  const refreshCatalog = useCallback(async () => {
    const response = await fetch('/api/skills', { cache: 'no-store' })
    const payload = (await response.json()) as { skills?: CatalogSkill[]; error?: string }
    if (!response.ok) {
      throw new Error(payload.error || '无法读取 skill')
    }
    setCatalog(payload.skills ?? [])
  }, [])

  const refreshRuns = useCallback(async () => {
    const response = await fetch('/api/skills/runs', { cache: 'no-store' })
    const payload = (await response.json()) as { running?: string[]; error?: string }
    if (!response.ok) return
    setRunning(payload.running ?? [])
  }, [])

  useEffect(() => {
    refreshCatalog().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : '无法读取 skill')
    })
  }, [refreshCatalog])

  useEffect(() => {
    void refreshRuns()
    const timer = window.setInterval(() => {
      void refreshRuns()
    }, 2000)
    return () => window.clearInterval(timer)
  }, [refreshRuns])

  const catalogByName = useMemo(() => {
    const map = new Map<string, CatalogSkill>()
    for (const skill of catalog) map.set(skill.name, skill)
    return map
  }, [catalog])

  const totalPages = Math.max(1, Math.ceil(catalog.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages - 1)
  const pageItems = catalog.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE)

  const addSkill = (name: string): void => {
    setToolbox((current) => {
      if (current.includes(name)) return current
      const next = [...current, name]
      writeToolbox(next)
      return next
    })
  }

  const removeSkill = (name: string): void => {
    setToolbox((current) => {
      const next = current.filter((item) => item !== name)
      writeToolbox(next)
      return next
    })
    setContextMenu(null)
  }

  useEffect(() => {
    if (!contextMenu) return
    const close = (): void => setContextMenu(null)
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    const timer = window.requestAnimationFrame(() => {
      window.addEventListener('click', close)
      window.addEventListener('contextmenu', close)
    })
    window.addEventListener('keydown', onKey)
    return () => {
      window.cancelAnimationFrame(timer)
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [contextMenu])

  const callSkill = async (
    path: '/api/skills/run' | '/api/skills/stop',
    name: string
  ): Promise<void> => {
    setBusy(name)
    setError(null)
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      })
      const payload = (await response.json()) as { error?: string; code?: string }
      if (!response.ok) {
        const message = payload.error || '操作失败'
        setError(message)
        if (path === '/api/skills/run' && (payload.code === 'ai_auth' || response.status === 401)) {
          onAiAuthError?.(message)
        }
        return
      }
      await refreshRuns()
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="relative z-20 flex min-h-0 min-w-0 flex-col overflow-visible rounded-2xl border border-dashed border-[var(--panel-edge)] bg-[var(--panel)]/60 py-3 pl-3 pr-1">
      <header className="relative mb-3 flex items-center justify-start gap-2 px-1">
        <div
          className="relative"
          onMouseEnter={() => setMenuOpen(true)}
          onMouseLeave={() => setMenuOpen(false)}
        >
          <button
            type="button"
            className="rounded-lg bg-[var(--brass)] px-2.5 py-1 text-xs font-medium text-[var(--ink)]"
          >
            添加工具
          </button>
          {menuOpen ? (
            <div className="absolute right-0 top-full z-50 pt-2">
              <div className="w-[min(32rem,70vw)] overflow-hidden rounded-xl border border-[var(--panel-edge)] bg-[var(--paper)] text-[var(--ink)] shadow-lift">
                <table className="w-full table-fixed text-left text-xs">
                  <thead className="bg-black/5 text-[11px] uppercase tracking-wide text-[var(--ink-soft)]">
                    <tr>
                      <th className="w-[28%] px-2 py-2 font-medium">名称</th>
                      <th className="px-2 py-2 font-medium">描述</th>
                      <th className="w-16 px-2 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-2 py-6 text-center text-[var(--ink-soft)]">
                          未发现 `.agents/skills`
                        </td>
                      </tr>
                    ) : (
                      pageItems.map((skill) => {
                        const added = toolbox.includes(skill.name)
                        return (
                          <tr key={skill.name} className="border-t border-black/10">
                            <td className="truncate px-2 py-2 font-medium" title={skill.name}>
                              {skill.name}
                            </td>
                            <td
                              className="truncate px-2 py-2 text-[var(--ink-soft)]"
                              title={skill.summary}
                            >
                              {skill.summary || '—'}
                            </td>
                            <td className="px-2 py-2 text-right">
                              <button
                                type="button"
                                disabled={added}
                                onClick={() => addSkill(skill.name)}
                                className="rounded-md bg-[var(--ink)] px-2 py-0.5 text-[11px] text-[var(--paper)] disabled:opacity-40"
                              >
                                {added ? '已添加' : '添加'}
                              </button>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
                <div className="flex items-center justify-between border-t border-black/10 px-2 py-1.5 text-[11px] text-[var(--ink-soft)]">
                  <span>
                    {catalog.length} 条 · 第 {currentPage + 1}/{totalPages} 页
                  </span>
                  <span className="flex gap-1">
                    <button
                      type="button"
                      disabled={currentPage <= 0}
                      onClick={() => setPage((value) => Math.max(0, value - 1))}
                      className="rounded px-1.5 py-0.5 hover:bg-black/5 disabled:opacity-30"
                    >
                      上一页
                    </button>
                    <button
                      type="button"
                      disabled={currentPage >= totalPages - 1}
                      onClick={() => setPage((value) => Math.min(totalPages - 1, value + 1))}
                      className="rounded px-1.5 py-0.5 hover:bg-black/5 disabled:opacity-30"
                    >
                      下一页
                    </button>
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </header>

      {error ? <p className="mb-2 truncate px-1 text-xs text-[var(--rust)]">{error}</p> : null}

      <div className="column-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {toolbox.length === 0 ? (
          <p className="px-1 py-8 text-center text-sm text-[var(--mist)]">尚未添加工具</p>
        ) : (
          toolbox.map((name) => {
            const skill = catalogByName.get(name)
            const isRunning = running.includes(name)
            const description = skill?.summary || '（无描述）'
            return (
              <article
                key={name}
                className="flex items-center gap-2 rounded-xl bg-[var(--paper)] px-2.5 py-2 text-[var(--ink)] shadow-card"
                onContextMenu={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setContextMenu({ name, x: event.clientX, y: event.clientY })
                }}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium" title={description}>
                  {name}
                </span>
                {isRunning ? (
                  <button
                    type="button"
                    disabled={busy === name}
                    onClick={() => void callSkill('/api/skills/stop', name)}
                    className="shrink-0 rounded-md bg-[var(--rust)] px-2 py-0.5 text-[11px] text-white disabled:opacity-40"
                  >
                    停止
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy === name}
                    onClick={() => void callSkill('/api/skills/run', name)}
                    className="shrink-0 rounded-md bg-[var(--teal)] px-2 py-0.5 text-[11px] text-white disabled:opacity-40"
                  >
                    开始
                  </button>
                )}
              </article>
            )
          })
        )}
      </div>

      {contextMenu ? (
        <div
          className="fixed z-[80] min-w-[7.5rem] overflow-hidden rounded-lg border border-black/10 bg-[var(--paper)] py-1 text-sm text-[var(--ink)] shadow-lift"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left hover:bg-black/5"
            onClick={() => removeSkill(contextMenu.name)}
          >
            移除
          </button>
        </div>
      ) : null}
    </section>
  )
}
