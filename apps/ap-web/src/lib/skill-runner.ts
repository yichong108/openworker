import { Agent, Cursor, CursorAgentError } from '@cursor/sdk'

import { isAiAuthFailure, readAiConfig } from './ai-config'
import { loadCursorEnv, resolveModelId } from './load-env'
import { buildSkillPrompt, listAgentsSkills, readSkillMarkdown } from './skills-fs'
import { TaskFsError } from './task-fs-error'
import { getWorkspaceRoot } from './workspace-root'

type AgentInstance = Awaited<ReturnType<typeof Agent.create>>
type RunInstance = Awaited<ReturnType<AgentInstance['send']>>

type SkillJob = {
  name: string
  agent: AgentInstance
  run?: RunInstance
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
 * 用 Cursor SDK 本地 Agent 启动指定 skill（后台跑完，不阻塞 HTTP）。
 *
 * @param name - `.agents/skills` 目录名
 * @param userInput - 可选用户补充，空则按 skill 默认流程
 */
export async function startSkill(name: string, userInput?: string): Promise<void> {
  loadCursorEnv()
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
  const config = readAiConfig()
  const apiKey = config.cursor.apiKey.trim() || process.env.CURSOR_API_KEY?.trim()
  const model = config.cursor.model.trim() || resolveModelId()

  if (!apiKey) {
    try {
      const status = await Cursor.auth.status()
      if (status.status !== 'logged-in') {
        throw new TaskFsError('Cursor 未登录且未填写 API Key，请先完成 AI 配置', 401, 'ai_auth')
      }
    } catch (error) {
      if (error instanceof TaskFsError) throw error
      throw new TaskFsError('Cursor 鉴权失败，请先完成 AI 配置', 401, 'ai_auth')
    }
  }

  let agent: AgentInstance
  try {
    agent = await Agent.create({
      ...(apiKey ? { apiKey } : {}),
      name,
      model: { id: model },
      mode: 'agent',
      local: {
        cwd: workspaceRoot,
        settingSources: ['project']
      }
    })
  } catch (error) {
    if (error instanceof CursorAgentError || isAiAuthFailure(error)) {
      throw new TaskFsError(
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
      const run = await agent.send(prompt)
      job.run = run
      if (run.supports('stream')) {
        for await (const _event of run.stream()) {
          /* 排空流，保证 wait 能结束 */
        }
      }
      await run.wait()
    } catch (error) {
      if (!job.cancelled) {
        job.error = error instanceof Error ? error.message : String(error)
      }
    } finally {
      try {
        await agent[Symbol.asyncDispose]()
      } catch {
        /* 忽略释放失败 */
      }
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
  try {
    if (job.run?.supports('cancel')) {
      await job.run.cancel()
    }
  } finally {
    try {
      await job.agent[Symbol.asyncDispose]()
    } catch {
      /* 忽略 */
    }
    rememberResult(job)
    jobs.delete(name)
  }
}
