'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const PAGE_SIZE = 20
const STORAGE_KEY = 'ap-web-toolbox-skills'
const SCHEDULE_KEY = 'ap-web-toolbox-schedules'

type CatalogSkill = {
  name: string
  summary: string
}

type ToolsColumnProps = {
  onAiAuthError?: (message: string) => void
}

type ScheduleState = {
  enabled: boolean
  time: string
  loops: number
  remaining: number
  nextAt: number | null
}

type RunSnapshot = {
  running?: string[]
  last?: Record<string, { ok?: boolean; error?: string; cancelled?: boolean; finishedAt?: number }>
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

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function blankSchedule(): ScheduleState {
  return { enabled: false, time: '09:00', loops: 1, remaining: 1, nextAt: null }
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

/**
 * 从 localStorage 读出各工具的定时设置。
 */
function readSchedules(): Record<string, ScheduleState> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(SCHEDULE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const result: Record<string, ScheduleState> = {}
    for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      const item = value as Partial<ScheduleState>
      const time =
        typeof item.time === 'string' && /^\d{2}:\d{2}$/.test(item.time) ? item.time : '09:00'
      const loops = Math.max(1, Math.min(99, Number(item.loops) || 1))
      const remaining = Math.max(0, Math.min(loops, Number(item.remaining) || loops))
      result[name] = {
        enabled: Boolean(item.enabled),
        time,
        loops,
        remaining: item.enabled ? Math.max(1, remaining) : remaining,
        nextAt: null
      }
    }
    return result
  } catch {
    return {}
  }
}

function writeSchedules(schedules: Record<string, ScheduleState>): void {
  const stored: Record<string, Omit<ScheduleState, 'nextAt'>> = {}
  for (const [name, item] of Object.entries(schedules)) {
    stored[name] = {
      enabled: item.enabled,
      time: item.time,
      loops: item.loops,
      remaining: item.remaining
    }
  }
  window.localStorage.setItem(SCHEDULE_KEY, JSON.stringify(stored))
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
  const [expanded, setExpanded] = useState<string | null>(null)
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [schedules, setSchedules] = useState<Record<string, ScheduleState>>({})

  const schedulesRef = useRef(schedules)
  const inputsRef = useRef(inputs)
  const genRef = useRef<Record<string, number>>({})
  const timersRef = useRef<Record<string, number>>({})
  const onAuthRef = useRef(onAiAuthError)
  const tickRef = useRef<(name: string, gen: number) => Promise<void>>(async () => undefined)

  schedulesRef.current = schedules
  inputsRef.current = inputs
  onAuthRef.current = onAiAuthError

  useEffect(() => {
    setToolbox(readToolbox())
  }, [])

  const persistSchedules = (next: Record<string, ScheduleState>): void => {
    schedulesRef.current = next
    setSchedules(next)
    writeSchedules(next)
  }

  const patchSchedule = (name: string, partial: Partial<ScheduleState>): ScheduleState => {
    const current = schedulesRef.current[name] ?? blankSchedule()
    const nextItem = { ...current, ...partial }
    persistSchedules({ ...schedulesRef.current, [name]: nextItem })
    return nextItem
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
    const item = schedulesRef.current[name]
    if (!item?.enabled) return
    clearTimer(name)
    const nextAt = nextOccurrence(item.time)
    patchSchedule(name, { nextAt })
    const gen = genRef.current[name] ?? 0
    const delay = Math.max(50, nextAt - Date.now())
    timersRef.current[name] = window.setTimeout(() => {
      void tickRef.current(name, gen)
    }, delay)
  }

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
    setExpanded((current) => (current === name ? null : current))
    setInputs((current) => {
      const next = { ...current }
      delete next[name]
      return next
    })
    invalidate(name)
    if (schedulesRef.current[name]) {
      const next = { ...schedulesRef.current }
      delete next[name]
      persistSchedules(next)
    }
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
      const input = inputsRef.current[name]?.trim()
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          ...(path === '/api/skills/run' && input ? { input } : {})
        })
      })
      const payload = (await response.json()) as { error?: string; code?: string }
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
    if (!schedulesRef.current[name]?.enabled) return
    const ok = await startAndWait(name)
    if ((genRef.current[name] ?? 0) !== gen) return
    if (!ok) {
      invalidate(name)
      patchSchedule(name, { enabled: false, nextAt: null })
      return
    }
    const remaining = (schedulesRef.current[name]?.remaining ?? 1) - 1
    if (remaining <= 0) {
      invalidate(name)
      patchSchedule(name, { enabled: false, remaining: 0, nextAt: null })
      return
    }
    patchSchedule(name, { remaining })
    arm(name)
  }

  useEffect(() => {
    const stored = readSchedules()
    persistSchedules(stored)
    for (const [name, item] of Object.entries(stored)) {
      if (item.enabled) arm(name)
    }
    return () => {
      for (const id of Object.values(timersRef.current)) window.clearTimeout(id)
    }
    // 仅在进入页面时恢复定时
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
            const schedule = schedules[name] ?? {
              enabled: false,
              time: '09:00',
              loops: 1,
              remaining: 1,
              nextAt: null
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
                    title={description}
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
                      disabled={busy === name}
                      onClick={() => {
                        invalidate(name)
                        if (schedulesRef.current[name]?.enabled) {
                          patchSchedule(name, { enabled: false, nextAt: null })
                        }
                        void callSkill('/api/skills/stop', name)
                      }}
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
                </div>
                {expanded === name ? (
                  <div className="border-t border-black/10 px-2.5 pb-2.5 pt-2">
                    <p className="text-xs leading-5 text-[var(--ink-soft)]">{description}</p>
                    <textarea
                      rows={2}
                      value={inputs[name] ?? ''}
                      onChange={(event) =>
                        setInputs((current) => ({ ...current, [name]: event.target.value }))
                      }
                      placeholder="有想法写这儿就好"
                      className="mt-2 w-full resize-none rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs leading-5 outline-none ring-[var(--brass)] focus:ring-2"
                    />
                    <div className="mt-2 rounded-lg bg-[var(--paper-deep)] px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium">定时</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={schedule.enabled}
                          onClick={() => {
                            const current = schedulesRef.current[name] ?? blankSchedule()
                            if (current.enabled) {
                              invalidate(name)
                              patchSchedule(name, { enabled: false, nextAt: null })
                              return
                            }
                            const loops = Math.max(1, Math.min(99, current.loops))
                            invalidate(name)
                            patchSchedule(name, { enabled: true, loops, remaining: loops })
                            arm(name)
                          }}
                          className={`relative h-5 w-9 shrink-0 rounded-full transition ${
                            schedule.enabled ? 'bg-[var(--teal)]' : 'bg-black/20'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
                              schedule.enabled ? 'left-4' : 'left-0.5'
                            }`}
                          />
                        </button>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="text-[11px] text-[var(--ink-soft)]">
                          时间
                          <input
                            type="time"
                            value={schedule.time}
                            onChange={(event) => {
                              const time = event.target.value || schedule.time
                              patchSchedule(name, { time })
                              if (schedulesRef.current[name]?.enabled) arm(name)
                            }}
                            className="mt-1 h-7 w-full rounded-md border border-black/10 bg-white px-1.5 text-xs text-[var(--ink)] outline-none"
                          />
                        </label>
                        <label className="text-[11px] text-[var(--ink-soft)]">
                          次数
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={schedule.loops}
                            onChange={(event) => {
                              const loops = Math.max(
                                1,
                                Math.min(99, Number(event.target.value) || 1)
                              )
                              const enabled = Boolean(schedulesRef.current[name]?.enabled)
                              patchSchedule(name, {
                                loops,
                                remaining: enabled
                                  ? loops
                                  : (schedulesRef.current[name]?.remaining ?? loops)
                              })
                            }}
                            className="mt-1 h-7 w-full rounded-md border border-black/10 bg-white px-1.5 text-xs text-[var(--ink)] outline-none"
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
