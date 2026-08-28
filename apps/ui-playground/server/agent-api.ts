/**
 * playground 服务端：用 BaseAgentWithAGUI.run() 把 AG-UI BaseEvent 写成 SSE。
 *
 * 仅被 Vite middleware 经 ssrLoadModule 加载，不进入浏览器包。
 */

import { randomUUID, type BaseEvent, type Message } from '@ag-ui/client'
import { BaseAgentWithAGUI } from '@openworker/base-agent'
import { getChatModel } from '@openworker/llm'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1'
const DEFAULT_MODEL = 'deepseek-chat'

const playgroundDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(playgroundDir, '../../..')

type AgentRunBody = {
  messages?: Array<{ id?: string; role?: string; content?: string }>
  apiKey?: string
  baseURL?: string
  model?: string
  cwd?: string
}

let activeAgent: BaseAgentWithAGUI | null = null

/**
 * 读取 JSON 请求体。
 *
 * @param req - Node 请求
 * @returns 解析后的对象
 */
function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolveJson, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolveJson(raw ? JSON.parse(raw) : {})
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.writableEnded) return
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function pathnameOf(req: IncomingMessage): string {
  const url = req.url ?? '/'
  return url.split('?')[0] ?? '/'
}

function envKey(): string {
  return process.env.DEEPSEEK_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || ''
}

function envBaseURL(): string {
  return process.env.DEEPSEEK_BASE_URL?.trim() || DEEPSEEK_BASE_URL
}

function envModel(): string {
  return process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL
}

function resolveCwd(raw?: string): string {
  const trimmed = raw?.trim() || process.env.OW_PLAYGROUND_REPO_ROOT?.trim()
  return trimmed ? resolve(trimmed) : repoRoot
}

function toAguiMessages(body: AgentRunBody): Message[] {
  const source = Array.isArray(body.messages) ? body.messages : []
  const out: Message[] = []
  for (const item of source) {
    if (item.role !== 'user' && item.role !== 'assistant') continue
    const content = typeof item.content === 'string' ? item.content : ''
    if (!content.trim()) continue
    out.push({
      id: typeof item.id === 'string' && item.id ? item.id : randomUUID(),
      role: item.role,
      content
    })
  }
  return out
}

function writeSseEvent(res: ServerResponse, event: BaseEvent): void {
  if (res.writableEnded) return
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

function initSse(res: ServerResponse): void {
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  if (typeof res.flushHeaders === 'function') res.flushHeaders()
}

function handleStop(res: ServerResponse): void {
  activeAgent?.abortRun()
  activeAgent = null
  sendJson(res, 200, { ok: true })
}

async function handleRun(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: AgentRunBody
  try {
    body = (await readJson(req)) as AgentRunBody
  } catch {
    sendJson(res, 400, { message: '请求体不是合法 JSON' })
    return
  }

  const apiKey = body.apiKey?.trim() || envKey()
  const baseURL = body.baseURL?.trim() || envBaseURL()
  const model = body.model?.trim() || envModel()
  const cwd = resolveCwd(body.cwd)

  let provider
  try {
    provider = getChatModel({ apiKey, baseURL, model })
  } catch (error) {
    sendJson(res, 400, {
      message: error instanceof Error ? error.message : String(error)
    })
    return
  }
  if (!provider) {
    sendJson(res, 401, {
      message: '未配置 API Key。请在本页填写，或设置 DEEPSEEK_API_KEY。'
    })
    return
  }

  const messages = toAguiMessages(body)
  if (!messages.some((item) => item.role === 'user')) {
    sendJson(res, 400, { message: 'messages 须含至少一条 user 消息' })
    return
  }

  activeAgent?.abortRun()
  const agent = new BaseAgentWithAGUI({
    agentId: 'ui-playground',
    description: 'ChatSession playground · BaseAgentWithAGUI',
    baseAgent: { cwd },
    runDefaults: { provider }
  })
  activeAgent = agent

  initSse(res)

  const subscription = agent
    .run({
      threadId: 'ui-playground',
      runId: randomUUID(),
      state: {},
      messages,
      tools: [],
      context: [],
      forwardedProps: {}
    })
    .subscribe({
      next: (event) => writeSseEvent(res, event),
      error: (error) => {
        if (!res.writableEnded) {
          res.write(
            `data: ${JSON.stringify({
              type: 'RUN_ERROR',
              message: error instanceof Error ? error.message : String(error),
              code: 'ERROR'
            })}\n\n`
          )
          res.write('event: done\ndata: {}\n\n')
          res.end()
        }
        if (activeAgent === agent) activeAgent = null
      },
      complete: () => {
        if (!res.writableEnded) {
          res.write('event: done\ndata: {}\n\n')
          res.end()
        }
        if (activeAgent === agent) activeAgent = null
      }
    })

  const onClose = () => {
    subscription.unsubscribe()
    agent.abortRun()
    if (activeAgent === agent) activeAgent = null
  }
  req.on('close', onClose)
}

/**
 * Vite connect 中间件：/api/agent/run|stop。
 *
 * @param req - 请求
 * @param res - 响应
 * @param next - 下一中间件
 */
export async function handleAgentApi(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void
): Promise<void> {
  const path = pathnameOf(req)
  if (!path.startsWith('/api/agent')) {
    next()
    return
  }

  try {
    if (req.method === 'POST' && path === '/api/agent/stop') {
      handleStop(res)
      return
    }
    if (req.method === 'POST' && path === '/api/agent/run') {
      await handleRun(req, res)
      return
    }
    sendJson(res, 404, { message: 'unknown agent endpoint' })
  } catch (error) {
    sendJson(res, 500, {
      message: error instanceof Error ? error.message : String(error)
    })
  }
}
