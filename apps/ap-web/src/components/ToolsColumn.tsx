'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ApInputNumber } from '@/components/antd/ApInputNumber'
import { ApSwitch } from '@/components/antd/ApSwitch'
import { ApTextArea } from '@/components/antd/ApTextArea'
import { ApTimePicker } from '@/components/antd/ApTimePicker'

const PAGE_SIZE = 20
const USER_TEXT_DEBOUNCE_MS = 400

type CatalogSkill = {
  name: string
  summary: string
}

type ToolsColumnProps = {
  onAiAuthError?: (message: string) => void
  className?: string
}

type StoredSchedule = {
  enabled: boolean
  time: string
  loops: number
  remaining: number
}

type ToolboxRecord = {
  name: string
  userText: string
  schedule: StoredSchedule
}

type ScheduleState = StoredSchedule & {
  nextAt: number | null
}

type RunSnapshot = {
  running?: string[]
  last?: Record<string, { ok?: boolean; error?: string; cancelled?: boolean; finishedAt?: number }>
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function blankSchedule(): StoredSchedule {
  return { enabled: false, time: '09:00', loops: 1, remaining: 1 }
}

function blankRecord(name: string): ToolboxRecord {
  return { name, userText: '', schedule: blankSchedule() }
}

function nextOccurrence(hhmm: string, from = Date.now()): number {
  const [hoursRaw, minutesRaw] = hhmm.split(':')
  const hours = Number(hoursRaw)
  const minutes = Number(minutesRaw)
  const next = new Date(from)
  next.setSeconds(0, 0)
  next.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0)
  if (next.getTime() <= from) next.setDate(next.getDate() + 1)
  return next.getTime()
}

function formatNextAt(timestamp: number): string {
  const date = new Date(timestamp)
  const clock = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  const today = new Date()
  if (date.toDateString() === today.toDateString()) return clock
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (date.toDateString() === tomorrow.toDateString()) return `明天 ${clock}`
  return `${date.getMonth() + 1}/${date.getDate()} ${clock}`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function scheduleOf(items: ToolboxRecord[], name: string): StoredSchedule {
  return items.find((item) => item.name === name)?.schedule ?? blankSchedule()
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden="true">
      <path d="M8 5.2v13.6c0 .7.8 1.1 1.4.7l10.2-6.8c.6-.4.6-1.2 0-1.6L9.4 4.5C8.8 4.1 8 4.5 8 5.2z" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden="true">
      <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

/**
 * 工具集列：从 `.agents/ap-config/skills` 与 `.agents/skills` 挑选 skill 并执行。
 */
export function ToolsColumn({ onAiAuthError, className }: ToolsColumnProps) {
  const [catalog, setCatalog] = useState<CatalogSkill[]>([])
  const [items, setItems] = useState<ToolboxRecord[]>([])
  const [running, setRunning] = useState<string[]>([])
  const [page, setPage] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    name: string
    x: number
    y: number
  } | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [nextAtByName, setNextAtByName] = useState<Record<string, number | null>>({})

  const itemsRef = useRef(items)
  const nextAtRef = useRef(nextAtByName)
  const genRef = useRef<Record<string, number>>({})
  const timersRef = useRef<Record<string, number>>({})
  const debounceRef = useRef<number>(0)
  const saveSeqRef = useRef(0)
  const onAuthRef = useRef(onAiAuthError)
  const tickRef = useRef<(name: string, gen: number) => Promise<void>>(async () => undefined)
  const armRef = useRef<(name: string) => void>(() => undefined)

  itemsRef.current = items
  nextAtRef.current = nextAtByName
  onAuthRef.current = onAiAuthError

  const persistItems = useCallback(async (next: ToolboxRecord[]) => {
    const previous = itemsRef.current
    itemsRef.current = next
    setItems(next)
    window.clearTimeout(debounceRef.current)
    const seq = (saveSeqRef.current += 1)
    try {
      const response = await fetch('/api/toolbox', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: next })
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok) {
        throw new Error(payload.error || '无法保存工具集')
      }
    } catch (err) {
      if (seq === saveSeqRef.current) {
        itemsRef.current = previous
        setItems(previous)
        setError(err instanceof Error ? err.message : '无法保存工具集')
      }
    }
  }, [])

  const persistItemsDebounced = useCallback(
    (next: ToolboxRecord[]) => {
      itemsRef.current = next
      setItems(next)
      window.clearTimeout(debounceRef.current)
      debounceRef.current = window.setTimeout(() => {
        void persistItems(itemsRef.current)
      }, USER_TEXT_DEBOUNCE_MS)
    },
    [persistItems]
  )

  const patchSchedule = (name: string, partial: Partial<ScheduleState>): ScheduleState => {
    const current = {
      ...scheduleOf(itemsRef.current, name),
      nextAt: nextAtRef.current[name] ?? null
    }
    const merged: ScheduleState = { ...current, ...partial }
    if ('nextAt' in partial) {
      const nextMap = { ...nextAtRef.current, [name]: merged.nextAt }
      nextAtRef.current = nextMap
      setNextAtByName(nextMap)
    }
    const persistKeys = Object.keys(partial).filter((key) => key !== 'nextAt')
    if (persistKeys.length > 0) {
      const stored: StoredSchedule = {
        enabled: merged.enabled,
        time: merged.time,
        loops: merged.loops,
        remaining: merged.remaining
      }
      const next = itemsRef.current.map((item) =>
        item.name === name ? { ...item, schedule: stored } : item
      )
      void persistItems(next)
    }
    return merged
  }

  const clearTimer = (name: string): void => {
    if (timersRef.current[name]) {
      window.clearTimeout(timersRef.current[name])
      delete timersRef.current[name]
    }
  }

  const invalidate = (name: string): void => {
    genRef.current[name] = (genRef.current[name] ?? 0) + 1
    clearTimer(name)
  }

  const arm = (name: string): void => {
    const item = scheduleOf(itemsRef.current, name)
    if (!item.enabled) return
    clearTimer(name)
    const nextAt = nextOccurrence(item.time)
    patchSchedule(name, { nextAt })
    const gen = genRef.current[name] ?? 0
    const delay = Math.max(50, nextAt - Date.now())
    timersRef.current[name] = window.setTimeout(() => {
      void tickRef.current(name, gen)
    }, delay)
  }

  armRef.current = arm

  const refreshCatalog = useCallback(async () => {
    const response = await fetch('/api/skills', { cache: 'no-store' })
    const payload = (await response.json()) as {
      skills?: CatalogSkill[]
      error?: string
    }
    if (!response.ok) {
      throw new Error(payload.error || '无法读取 skill')
    }
    setCatalog(payload.skills ?? [])
  }, [])

  const refreshRuns = useCallback(async () => {
    const response = await fetch('/api/skills/runs', { cache: 'no-store' })
    const payload = (await response.json()) as {
      running?: string[]
      error?: string
    }
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

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const response = await fetch('/api/toolbox', { cache: 'no-store' })
        const payload = (await response.json()) as {
          items?: ToolboxRecord[]
          error?: string
        }
        if (!response.ok) {
          throw new Error(payload.error || '无法读取工具集')
        }
        const loaded = payload.items ?? []
        itemsRef.current = loaded
        setItems(loaded)
        for (const record of loaded) {
          if (record.schedule.enabled) armRef.current(record.name)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '无法读取工具集')
      }
    }
    void load()
    return () => {
      window.clearTimeout(debounceRef.current)
      for (const id of Object.values(timersRef.current)) window.clearTimeout(id)
    }
  }, [])

  const catalogByName = useMemo(() => {
    const map = new Map<string, CatalogSkill>()
    for (const skill of catalog) map.set(skill.name, skill)
    return map
  }, [catalog])

  const toolboxNames = useMemo(() => items.map((item) => item.name), [items])
  const totalPages = Math.max(1, Math.ceil(catalog.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages - 1)
  const pageItems = catalog.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE)

  const addSkill = (name: string): void => {
    if (itemsRef.current.some((item) => item.name === name)) return
    void persistItems([...itemsRef.current, blankRecord(name)])
  }

  const removeSkill = (name: string): void => {
    invalidate(name)
    setContextMenu(null)
    setExpanded((current) => (current === name ? null : current))
    const nextAtMap = { ...nextAtRef.current }
    delete nextAtMap[name]
    nextAtRef.current = nextAtMap
    setNextAtByName(nextAtMap)
    void persistItems(itemsRef.current.filter((item) => item.name !== name))
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
  ): Promise<boolean> => {
    setBusy(name)
    setError(null)
    try {
      const input = itemsRef.current.find((item) => item.name === name)?.userText.trim()
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          ...(path === '/api/skills/run' && input ? { input } : {})
        })
      })
      const payload = (await response.json()) as {
        error?: string
        code?: string
      }
      if (!response.ok) {
        const message = payload.error || '操作失败'
        setError(message)
        if (path === '/api/skills/run' && (payload.code === 'ai_auth' || response.status === 401)) {
          onAuthRef.current?.(message)
        }
        return false
      }
      await refreshRuns()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败')
      return false
    } finally {
      setBusy(null)
    }
  }

  const startAndWait = async (name: string): Promise<boolean> => {
    const startedAt = Date.now()
    const started = await callSkill('/api/skills/run', name)
    if (!started) return false
    for (let i = 0; i < 3600; i += 1) {
      await sleep(1000)
      const response = await fetch('/api/skills/runs', { cache: 'no-store' })
      if (!response.ok) continue
      const snap = (await response.json()) as RunSnapshot
      setRunning(snap.running ?? [])
      if (snap.running?.includes(name)) continue
      const last = snap.last?.[name]
      if (!last || (last.finishedAt ?? 0) < startedAt - 2000) continue
      if (last.ok) return true
      if (last.cancelled) {
        setError('已停止，定时已关闭')
        return false
      }
      setError(last.error || '执行失败，定时已关闭')
      return false
    }
    setError('等待执行结果超时，定时已关闭')
    return false
  }

  tickRef.current = async (name, gen) => {
    if ((genRef.current[name] ?? 0) !== gen) return
    if (!scheduleOf(itemsRef.current, name).enabled) return
    const ok = await startAndWait(name)
    if ((genRef.current[name] ?? 0) !== gen) return
    if (!ok) {
      invalidate(name)
      patchSchedule(name, { enabled: false, nextAt: null })
      return
    }
    const remaining = (scheduleOf(itemsRef.current, name).remaining ?? 1) - 1
    if (remaining <= 0) {
      invalidate(name)
      patchSchedule(name, { enabled: false, remaining: 0, nextAt: null })
      return
    }
    patchSchedule(name, { remaining })
    arm(name)
  }

  return (
    <section
      className={`relative z-20 flex min-h-0 min-w-0 flex-col overflow-visible rounded-2xl border border-dashed border-[var(--panel-edge)] bg-[var(--panel)]/60 py-3 pl-3 pr-1 ${className ?? ''}`}
    >
      <header className="relative mb-3 flex items-center justify-start gap-2 px-1">
        <div
          className="relative"
          onMouseEnter={() => setMenuOpen(true)}
          onMouseLeave={() => setMenuOpen(false)}
        >
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--brass)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink)] shadow-sm transition hover:brightness-110 active:scale-[0.98]"
          >
            <PlusIcon />
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
                          未发现 skill（请先运行 ap init）
                        </td>
                      </tr>
                    ) : (
                      pageItems.map((skill) => {
                        const added = toolboxNames.includes(skill.name)
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
        {items.length === 0 ? (
          <p className="px-1 py-8 text-center text-sm text-[var(--mist)]">尚未添加工具</p>
        ) : (
          items.map((record) => {
            const { name } = record
            const skill = catalogByName.get(name)
            const isRunning = running.includes(name)
            const description = skill?.summary || '（无描述）'
            const schedule: ScheduleState = {
              ...record.schedule,
              nextAt: nextAtByName[name] ?? null
            }
            return (
              <article
                key={name}
                className={`rounded-xl bg-[var(--paper)] text-[var(--ink)] shadow-card transition ${
                  expanded === name ? 'shadow-lift' : ''
                }`}
                onContextMenu={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setContextMenu({ name, x: event.clientX, y: event.clientY })
                }}
              >
                <div className="flex items-center gap-2 px-2.5 py-2">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm font-medium"
                    title="点击展开/收起"
                    onClick={() => setExpanded((current) => (current === name ? null : name))}
                  >
                    <span className="min-w-0 truncate">{name}</span>
                    {schedule.enabled ? (
                      <span className="shrink-0 rounded bg-[var(--teal)]/15 px-1 py-px text-[10px] font-normal text-[var(--teal)]">
                        定时
                      </span>
                    ) : null}
                  </button>
                  {isRunning ? (
                    <button
                      type="button"
                      aria-label="停止"
                      title="停止"
                      disabled={busy === name}
                      onClick={() => {
                        invalidate(name)
                        if (scheduleOf(itemsRef.current, name).enabled) {
                          patchSchedule(name, { enabled: false, nextAt: null })
                        }
                        void callSkill('/api/skills/stop', name)
                      }}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--rust)] text-white disabled:opacity-40"
                    >
                      <StopIcon />
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label="开始"
                      title="开始"
                      disabled={busy === name}
                      onClick={() => void callSkill('/api/skills/run', name)}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--teal)] text-white disabled:opacity-40"
                    >
                      <PlayIcon />
                    </button>
                  )}
                </div>
                {expanded === name ? (
                  <div className="border-t border-black/10 px-2.5 pb-2.5 pt-2">
                    <p className="text-xs leading-5 text-[var(--ink-soft)]">{description}</p>
                    <ApTextArea
                      rows={2}
                      value={record.userText}
                      onChange={(userText) => {
                        persistItemsDebounced(
                          itemsRef.current.map((item) =>
                            item.name === name ? { ...item, userText } : item
                          )
                        )
                      }}
                      placeholder="有想法写这儿就好"
                      className="mt-2 resize-none text-xs leading-5"
                    />
                    <div className="mt-2 rounded-lg bg-[var(--paper-deep)] px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium">定时</span>
                        <ApSwitch
                          checked={schedule.enabled}
                          onChange={(enabled) => {
                            const current = scheduleOf(itemsRef.current, name)
                            if (!enabled) {
                              invalidate(name)
                              patchSchedule(name, {
                                enabled: false,
                                nextAt: null
                              })
                              return
                            }
                            const loops = Math.max(1, Math.min(99, current.loops))
                            invalidate(name)
                            patchSchedule(name, {
                              enabled: true,
                              loops,
                              remaining: loops
                            })
                            arm(name)
                          }}
                        />
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="text-[11px] text-[var(--ink-soft)]">
                          时间
                          <ApTimePicker
                            value={schedule.time}
                            onChange={(time) => {
                              const next = time || schedule.time
                              patchSchedule(name, { time: next })
                              if (scheduleOf(itemsRef.current, name).enabled) arm(name)
                            }}
                            className="mt-1"
                          />
                        </label>
                        <label className="text-[11px] text-[var(--ink-soft)]">
                          次数
                          <ApInputNumber
                            min={1}
                            max={99}
                            value={schedule.loops}
                            onChange={(loops) => {
                              const enabled = scheduleOf(itemsRef.current, name).enabled
                              patchSchedule(name, {
                                loops,
                                remaining: enabled
                                  ? loops
                                  : (scheduleOf(itemsRef.current, name).remaining ?? loops)
                              })
                            }}
                            className="mt-1"
                          />
                        </label>
                      </div>
                      {schedule.enabled && schedule.nextAt ? (
                        <p className="mt-1.5 text-[11px] text-[var(--ink-soft)]">
                          下次 {formatNextAt(schedule.nextAt)}
                          {schedule.remaining > 0 ? ` · 还剩 ${schedule.remaining} 次` : ''}
                          ，页面开着才会跑
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
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
