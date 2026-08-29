import { EventType, randomUUID, type BaseEvent, type RunErrorEvent } from '@ag-ui/client'
import type { ApAgentWithAGUI } from '@openworker/ap-agent'
import type { Subscription } from 'rxjs'

import { buildSkillPrompt, findAgentsSkill, readSkillMarkdown } from '@/lib/skills-fs'
import {
  isSkillRunning,
  markSkillRunEnd,
  markSkillRunStart,
  type SkillRunLast
} from '@/lib/skill-run-state'
import { TaskFsError } from '@/lib/task-fs-error'
import { getWorkspaceRoot } from '@/lib/workspace-root'

import { createApWebAgent } from './agent-runtime'
import { isAiAuthFailure } from './config'

type SkillJob = {
  name: string
  agent: ApAgentWithAGUI
  subscription?: Subscription
  error?: string
  cancelled?: boolean
}

const jobs = new Map<string, SkillJob>()

function rememberResult(job: SkillJob): void {
  const result: SkillRunLast = {
    ok: !job.cancelled && !job.error,
    ...(job.error ? { error: job.error } : {}),
    ...(job.cancelled ? { cancelled: true } : {}),
    finishedAt: Date.now()
  }
  markSkillRunEnd(job.name, result)
}

/**
 * 当前正在执行的 skill 名列表。
 */
export function listRunningSkills(): string[] {
  return [...jobs.keys()]
}

/**
 * 用 ApAgentWithAGUI 启动指定 skill（后台跑完，不阻塞 HTTP）。
 */
export async function startSkill(name: string, userInput?: string): Promise<void> {
  const skill = findAgentsSkill(name)
  if (!skill) {
    throw new TaskFsError(`未找到 skill: ${name}`, 404)
  }
  if (jobs.has(name) || isSkillRunning(name)) {
    throw new TaskFsError(`${name} 已在执行`, 409)
  }

  const workspaceRoot = getWorkspaceRoot()
  const markdown = readSkillMarkdown(name)
  const extra = userInput?.trim()
  const prompt = buildSkillPrompt(name, markdown, extra || undefined, skill.relDir)

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
  markSkillRunStart(name)

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
