import type { SessionInfo } from '@/shared/ipc'

export const PRELOAD_MISSING_ERROR = '未检测到 preload 注入（window.bridge 不存在）'

export function filterSessionsForSidebar(
  list: SessionInfo[] | undefined,
  hiddenIds: string[] | undefined
): SessionInfo[] {
  const hidden = new Set(hiddenIds ?? [])
  return (list ?? []).filter((s) => !hidden.has(s.id))
}
