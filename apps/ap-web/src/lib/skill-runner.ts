import { EventType, randomUUID, type BaseEvent, type RunErrorEvent } from '@ag-ui/client'
import type { ApAgentWithAGUI } from '@openworker/ap-agent'
import type { Subscription } from 'rxjs'

import { createApWebAgent } from './ap-agent-runtime'
import { isAiAuthFailure } from './ai-config'
import { buildSkillPrompt, listAgentsSkills, readSkillMarkdown } from './skills-fs'
import { TaskFsError } from './task-fs-error'
import { getWorkspaceRoot } from './workspace-root'

type SkillJob = {
  name: string
  agent: ApAgentWithAGUI
  subscription?: Subscription
  error?: string
  cancelled?: boolean
}

export type SkillRunLast = {
  ok: boolean
  error?: string
  cancelled?: boolean
  finishedAt: number
}

const jobs = new Map<string, SkillJob>()
const lastResults = new Map<string, SkillRunLast>()

function rememberResult(job: SkillJob): void {
  lastResults.set(job.name, {
    ok: !job.cancelled && !job.error,
    ...(job.error ? { error: job.error } : {}),
    ...(job.cancelled ? { cancelled: true } : {}),
    finishedAt: Date.now()
  })
}

/**
 * 当前正在执行的 skill 名列表。
 *
 * @returns 目录名数组
 */
export function listRunningSkills(): string[] {
  return [...jobs.keys()]
}

/**
 * 运行中的 skill 以及最近一次结束结果（供定时循环判断成败）。
 */
export function listSkillRunSnapshot(): {
  running: string[]
  last: Record<string, SkillRunLast>
} {
  return {
    running: [...jobs.keys()],
    last: Object.fromEntries(lastResults)
  }
}

/**
 * 用 ApAgentWithAGUI 启动指定 skill（后台跑完，不阻塞 HTTP）。
 *
 * @param name - `.agents/skills` 目录名
 * @param userInput - 可选用户补充，空则按 skill 默认流程
 */
export async function startSkill(name: string, userInput?: string): Promise<void> {
  const skill = listAgentsSkills().find((item) => item.name === name)
  if (!skill) {
    throw new TaskFsError(`未找到 skill: ${name}`, 404)
  }
  if (jobs.has(name)) {
    throw new TaskFsError(`${name} 已在执行`, 409)
  }

  const workspaceRoot = getWorkspaceRoot()
  const markdown = readSkillMarkdown(name)
  const extra = userInput?.trim()
  const prompt = buildSkillPrompt(name, markdown, extra || undefined)

  let agent: ApAgentWithAGUI
  try {
    agent = createApWebAgent(workspaceRoot, name)
  } catch (error) {
    if (error instanceof TaskFsError || isAiAuthFailure(error)) {
      throw error instanceof TaskFsError
        ? error
        : new TaskFsError(
            `模型鉴权失败：${error instanceof Error ? error.message : '未知错误'}`,
            401,
            'ai_auth'
          )
    }
    throw error
  }

  const job: SkillJob = { name, agent }
  jobs.set(name, job)

  void (async () => {
    try {
      await new Promise<void>((resolve, reject) => {
        const subscription = agent
          .run({
            threadId: name,
            runId: randomUUID(),
            state: {},
            messages: [{ id: randomUUID(), role: 'user', content: prompt }],
            tools: [],
            context: [],
            forwardedProps: {}
          })
          .subscribe({
            next: (event: BaseEvent) => {
              if (job.cancelled) return
              if (event.type === EventType.RUN_ERROR) {
                const e = event as RunErrorEvent
                if (e.code !== 'CANCELLED') {
                  job.error = e.message || '执行失败'
                }
              }
            },
            error: (error) => {
              if (!job.cancelled) {
                job.error = error instanceof Error ? error.message : String(error)
              }
              reject(error)
            },
            complete: resolve
          })
        job.subscription = subscription
      })
    } catch (error) {
      if (!job.cancelled && !job.error) {
        job.error = error instanceof Error ? error.message : String(error)
      }
    } finally {
      job.subscription?.unsubscribe()
      rememberResult(job)
      jobs.delete(name)
    }
  })()
}

/**
 * 取消正在执行的 skill。
 *
 * @param name - skill 目录名
 */
export async function stopSkill(name: string): Promise<void> {
  const job = jobs.get(name)
  if (!job) {
    throw new TaskFsError(`${name} 未在执行`, 404)
  }
  job.cancelled = true
  job.agent.abortRun()
  job.subscription?.unsubscribe()
  rememberResult(job)
  jobs.delete(name)
}
