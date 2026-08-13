/**
 * 创建本地 Cursor Agent，流式输出并等待 skill 或用户提问跑完。
 */

import { Agent, Cursor, CursorAgentError, type SDKMessage } from '@cursor/sdk'

import {
  buildAskPrompt,
  buildSkillPrompt,
  readAgentsSkillBodies,
  readAgentsSkillMarkdown
} from './prompt.js'
import type { AipConversationMode } from './env.js'
import type { AgentsSkill } from './skills-fs.js'

/** 启动本地 Agent 执行用户提问所需参数 */
export type RunAipAskInput = {
  /** 用户原话 */
  query: string
  /** 已发现的 skill，供 Agent 选择 */
  skills: readonly AgentsSkill[]
  /** Cursor API Key；省略则走 CURSOR_API_KEY 或 login 凭证 */
  apiKey?: string
  /** 仓库根目录 */
  cwd: string
  /** 模型 id */
  model: string
  /** Cursor SDK 对话模式，默认 agent */
  mode: AipConversationMode
}

/** 启动本地 Agent 执行 skill 所需参数 */
export type RunAipSkillInput = {
  /** `.agents/skills` 下的目录名 */
  skill: string
  /** Cursor API Key；省略则走 CURSOR_API_KEY 或 login 凭证 */
  apiKey?: string
  /** 仓库根目录 */
  cwd: string
  /** 模型 id */
  model: string
  /** Cursor SDK 对话模式，默认 agent */
  mode: AipConversationMode
  /** 可选补充指令 */
  extra?: string
}

/**
 * 将 SDK 流事件写成终端可读的一行/增量文本。
 *
 * @param event - run.stream() 的 SDKMessage
 */
function writeStreamEvent(event: SDKMessage): void {
  switch (event.type) {
    case 'assistant':
      for (const block of event.message.content) {
        if (block.type === 'text') process.stdout.write(block.text)
      }
      break
    case 'thinking': {
      const text = event.text.replace(/\s+/g, ' ').trim()
      if (text) process.stderr.write(`[thinking] ${text}\n`)
      break
    }
    case 'tool_call':
      process.stderr.write(`[tool] ${event.status} ${event.name}\n`)
      break
    case 'status':
      if (event.status !== 'FINISHED') {
        process.stderr.write(`[status] ${event.status}\n`)
      }
      break
    default:
      break
  }
}

/**
 * 打开浏览器完成 Cursor SDK 登录，凭证写入 ~/.cursor/sdk/auth.json。
 */
export async function loginCursorSdk(): Promise<void> {
  process.stderr.write('正在打开浏览器登录 Cursor SDK…\n')
  const result = await Cursor.auth.login({
    apiKeyName: 'agent-weave aip'
  })
  const email = result.email ? ` (${result.email})` : ''
  process.stderr.write(`已登录${email}，凭证已保存。\n`)
}

/**
 * 用本地 Cursor Agent 发送已组装的 prompt 并等待结束。
 *
 * @param input - prompt / 日志名 / cwd / model / mode / 可选 apiKey
 * @returns 进程退出码：0 成功，1 启动失败，2 运行失败，130 取消
 */
async function runCursorPrompt(input: {
  prompt: string
  name: string
  cwd: string
  model: string
  mode: AipConversationMode
  apiKey?: string
}): Promise<number> {
  const agent = await Agent.create({
    ...(input.apiKey ? { apiKey: input.apiKey } : {}),
    name: input.name,
    model: { id: input.model },
    mode: input.mode,
    local: {
      cwd: input.cwd,
      settingSources: ['project']
    }
  })

  process.stderr.write(
    `[aip] name=${input.name} agent=${agent.agentId} cwd=${input.cwd} model=${input.model} mode=${input.mode}\n`
  )

  let run: Awaited<ReturnType<typeof agent.send>> | undefined

  const onSigint = (): void => {
    process.stderr.write('\n收到 SIGINT，正在取消…\n')
    if (run?.supports('cancel')) {
      void run.cancel()
    }
  }
  process.on('SIGINT', onSigint)

  try {
    run = await agent.send(input.prompt)
    process.stderr.write(`[aip] run=${run.id}\n`)

    if (run.supports('stream')) {
      for await (const event of run.stream()) {
        writeStreamEvent(event)
      }
    }

    const result = await run.wait()
    if (result.usage) {
      process.stderr.write(
        `\n[aip] tokens total=${result.usage.totalTokens} in=${result.usage.inputTokens} out=${result.usage.outputTokens}\n`
      )
    }

    if (result.status === 'finished') return 0
    if (result.status === 'cancelled') return 130
    process.stderr.write(`[aip] run failed: ${result.id} ${result.error?.message ?? ''}\n`)
    return 2
  } catch (err) {
    if (err instanceof CursorAgentError) {
      process.stderr.write(`[aip] startup failed: ${err.message} retryable=${err.isRetryable}\n`)
      return 1
    }
    throw err
  } finally {
    process.off('SIGINT', onSigint)
    await agent[Symbol.asyncDispose]()
  }
}

/**
 * 用本地 Cursor Agent 执行用户提问：列出 `.agents/skills` 由 Agent 选一个执行。
 *
 * @param input - query / skills / cwd / model / mode / 可选 apiKey
 * @returns 进程退出码：0 成功，1 启动失败，2 运行失败，130 取消
 */
export async function runAipAsk(input: RunAipAskInput): Promise<number> {
  if (input.skills.length === 0) {
    process.stderr.write('[aip] 未发现 `.agents/skills/*/SKILL.md`，无法根据提问选择 skill\n')
    return 1
  }
  const bodies = await readAgentsSkillBodies(input.cwd, input.skills)
  const prompt = buildAskPrompt(input.query, input.skills, bodies)
  return runCursorPrompt({
    prompt,
    name: 'aip-ask',
    cwd: input.cwd,
    model: input.model,
    mode: input.mode,
    ...(input.apiKey ? { apiKey: input.apiKey } : {})
  })
}

/**
 * 用本地 Cursor Agent 执行 `.agents/skills` 中的指定 skill。
 *
 * 显式设置 local.cwd 与 settingSources: project。prompt 内联 SKILL.md，
 * 避免 filesystem skill 未挂上。
 *
 * @param input - skill / cwd / model / mode / 可选 apiKey 与 extra
 * @returns 进程退出码：0 成功，1 启动失败，2 运行失败，130 取消
 */
export async function runAipSkill(input: RunAipSkillInput): Promise<number> {
  const skillMarkdown = await readAgentsSkillMarkdown(input.cwd, input.skill)
  const prompt = buildSkillPrompt(input.skill, skillMarkdown, input.extra)
  return runCursorPrompt({
    prompt,
    name: input.skill,
    cwd: input.cwd,
    model: input.model,
    mode: input.mode,
    ...(input.apiKey ? { apiKey: input.apiKey } : {})
  })
}
