/**
 * 右侧栏终端路由：SSE run + cancel + complete
 */

import { Router, type Router as ExpressRouter } from 'express'
import { completeCommandInWorkspace, killCommand, runCommand } from '@openworker/uni-agent'
import { MAX_TERMINAL_OUTPUT_CHARS } from '@openworker/shared'

import { endSse, initSseResponse, writeSseData } from '../agent/sse.js'
import { fail, ok, NotFoundError } from '../http/envelope.js'
import { getWorkspace } from '../services/workspace-service.js'

/**
 * Terminal 路由（本机单租户）
 *
 * - POST /terminal/run — SSE 推送 stdout/stderr，结束帧含完整 output
 * - POST /terminal/cancel
 * - POST /terminal/complete
 */
export const terminalRouter: ExpressRouter = Router()

terminalRouter.post('/terminal/run', async (req, res) => {
  const body = (req.body ?? {}) as { workspaceId?: string; command?: string }
  const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId.trim() : ''
  const command = typeof body.command === 'string' ? body.command : ''

  if (!workspaceId) {
    res.status(200).json(fail(40050, 'workspaceId is required'))
    return
  }

  let cwd: string
  try {
    const ws = await getWorkspace(workspaceId)
    cwd = ws.path?.trim() || ''
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(200).json(fail(40420, error.message))
      return
    }
    res.status(200).json(fail(50050, error instanceof Error ? error.message : String(error)))
    return
  }

  const trimmed = command.trim()
  if (!trimmed) {
    res.status(200).json(ok({ output: '请输入命令后再执行。' }))
    return
  }
  if (!cwd) {
    res.status(200).json(ok({ output: '当前工作区未绑定目录，无法执行命令。' }))
    return
  }

  initSseResponse(res)

  const sessionKey = `right-pane:${workspaceId}`
  let clientClosed = false
  req.on('close', () => {
    clientClosed = true
    void killCommand(sessionKey)
  })

  try {
    const output = await runCommand(sessionKey, cwd, trimmed, MAX_TERMINAL_OUTPUT_CHARS, {
      onChunk: (chunk, stream) => {
        writeSseData(res, { workspaceId, chunk, stream }, 'terminal')
      }
    })
    writeSseData(res, { workspaceId, output }, 'result')
  } catch (error) {
    writeSseData(
      res,
      {
        workspaceId,
        output: error instanceof Error ? error.message : String(error)
      },
      'result'
    )
  } finally {
    if (!clientClosed) {
      endSse(res)
    } else if (!res.writableEnded) {
      res.end()
    }
  }
})

terminalRouter.post('/terminal/cancel', async (req, res) => {
  try {
    const body = (req.body ?? {}) as { workspaceId?: string }
    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId.trim() : ''
    if (!workspaceId) {
      res.status(200).json(fail(40050, 'workspaceId is required'))
      return
    }
    await killCommand(`right-pane:${workspaceId}`)
    res.status(200).json(ok({ ok: true }))
  } catch (error) {
    console.error('[native] POST /terminal/cancel failed', error)
    res.status(200).json(fail(50051, error instanceof Error ? error.message : String(error)))
  }
})

terminalRouter.post('/terminal/complete', async (req, res) => {
  try {
    const body = (req.body ?? {}) as { workspaceId?: string; commandLine?: string }
    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId.trim() : ''
    const commandLine = typeof body.commandLine === 'string' ? body.commandLine : ''
    if (!workspaceId) {
      res.status(200).json(fail(40050, 'workspaceId is required'))
      return
    }
    const ws = await getWorkspace(workspaceId)
    const cwd = ws.path?.trim() || ''
    if (!cwd) {
      res.status(200).json(ok({ items: [] as string[] }))
      return
    }
    const items = await completeCommandInWorkspace(cwd, commandLine)
    res.status(200).json(ok({ items: items ?? [] }))
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(200).json(fail(40420, error.message))
      return
    }
    console.error('[native] POST /terminal/complete failed', error)
    res.status(200).json(ok({ items: [] as string[] }))
  }
})
