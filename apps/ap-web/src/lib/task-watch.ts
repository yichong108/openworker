import { existsSync, watch, type FSWatcher } from 'node:fs'
import { dirname } from 'node:path'

import { getApWebAgentsRoot } from './ap-web-agents-root'
import { listBoard } from './task-fs'
import type { TaskBoardPayload } from './task-types'

const WATCH_DEBOUNCE_MS = 150

type TaskBoardListener = (board: TaskBoardPayload) => void

type TaskWatchHub = {
  agentsWatcher: FSWatcher | null
  parentWatcher: FSWatcher | null
  listeners: Set<TaskBoardListener>
  debounceTimer: ReturnType<typeof setTimeout> | null
  lastPayload: string | null
}

const GLOBAL_KEY = '__apWebTaskWatchHub'

function getHub(): TaskWatchHub {
  const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: TaskWatchHub }
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      agentsWatcher: null,
      parentWatcher: null,
      listeners: new Set(),
      debounceTimer: null,
      lastPayload: null
    }
  }
  return g[GLOBAL_KEY]
}

function notifyIfBoardChanged(): void {
  let board: TaskBoardPayload
  try {
    board = listBoard()
  } catch {
    return
  }
  const serialized = JSON.stringify(board)
  const hub = getHub()
  if (hub.lastPayload === serialized) return
  hub.lastPayload = serialized
  for (const listener of hub.listeners) {
    listener(board)
  }
}

function scheduleNotify(): void {
  const hub = getHub()
  if (hub.debounceTimer) clearTimeout(hub.debounceTimer)
  hub.debounceTimer = setTimeout(() => {
    hub.debounceTimer = null
    notifyIfBoardChanged()
  }, WATCH_DEBOUNCE_MS)
}

function closeWatcher(watcher: FSWatcher | null): void {
  if (!watcher) return
  watcher.close()
}

function startAgentsWatch(hub: TaskWatchHub): void {
  if (hub.agentsWatcher) return
  const agentsRoot = getApWebAgentsRoot()
  if (!existsSync(agentsRoot)) return

  try {
    hub.agentsWatcher = watch(agentsRoot, { recursive: true }, () => {
      scheduleNotify()
    })
    hub.agentsWatcher.on('error', () => {
      closeWatcher(hub.agentsWatcher)
      hub.agentsWatcher = null
    })
  } catch {
    hub.agentsWatcher = null
  }
}

function startParentWatch(hub: TaskWatchHub): void {
  if (hub.parentWatcher) return
  const agentsRoot = getApWebAgentsRoot()
  const parent = dirname(agentsRoot)
  if (!existsSync(parent)) return

  try {
    hub.parentWatcher = watch(parent, (_event, filename) => {
      const name = filename?.split('\\').join('/') ?? ''
      if (name !== '.agents' && name !== '') return
      if (existsSync(agentsRoot)) startAgentsWatch(hub)
    })
    hub.parentWatcher.on('error', () => {
      closeWatcher(hub.parentWatcher)
      hub.parentWatcher = null
    })
  } catch {
    hub.parentWatcher = null
  }
}

function ensureWatching(): void {
  const hub = getHub()
  startAgentsWatch(hub)
  if (!hub.agentsWatcher) startParentWatch(hub)
}

/**
 * 订阅任务看板快照。首次订阅时开始监听敲命令目录下的 `.agents`。
 *
 * 任意文件事件都会防抖后重读看板；快照未变则不通知（避免 toolbox/skills 空刷）。
 *
 * @param listener - 变化后的整表快照
 * @returns 取消订阅
 */
export function subscribeTaskBoard(listener: TaskBoardListener): () => void {
  const hub = getHub()
  hub.listeners.add(listener)
  ensureWatching()
  return () => {
    hub.listeners.delete(listener)
  }
}
