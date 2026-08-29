export type SkillRunLast = {
  ok: boolean
  error?: string
  cancelled?: boolean
  finishedAt: number
}

const running = new Set<string>()
const lastResults = new Map<string, SkillRunLast>()

/**
 * 标记 skill 开始执行。
 */
export function markSkillRunStart(name: string): void {
  running.add(name)
}

/**
 * 记录 skill 结束并移出运行集。
 */
export function markSkillRunEnd(name: string, result: SkillRunLast): void {
  lastResults.set(name, result)
  running.delete(name)
}

/**
 * 当前 skill 是否在执行。
 */
export function isSkillRunning(name: string): boolean {
  return running.has(name)
}

/**
 * 运行中的 skill 以及最近一次结束结果（供定时轮询判断成败）。
 */
export function listSkillRunSnapshot(): {
  running: string[]
  last: Record<string, SkillRunLast>
} {
  return {
    running: [...running],
    last: Object.fromEntries(lastResults)
  }
}
