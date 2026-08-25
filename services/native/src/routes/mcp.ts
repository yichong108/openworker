/**
 * MCP probe / warmup 路由
 */

import { Router, type Router as ExpressRouter } from 'express'
import type { McpServerEntry } from '@openworker/shared'

import {
  getMcpWarmupStatus,
  onMcpServersChanged,
  probeMcpServer,
  startMcpWarmup
} from '../agent/mcp-warmup.js'
import { fail, ok } from '../http/envelope.js'
import { nativeLog } from '../logger.js'

/**
 * MCP 路由（本机单租户）
 *
 * - POST /mcp/probe
 * - GET  /mcp/warmup
 * - POST /mcp/warmup
 */
export const mcpRouter: ExpressRouter = Router()

mcpRouter.post('/mcp/probe', async (req, res) => {
  try {
    const entry = (req.body ?? {}) as McpServerEntry
    if (!entry || typeof entry !== 'object') {
      res.status(200).json(ok({ ok: false as const, error: '无效配置' }))
      return
    }
    const result = await probeMcpServer(entry)
    res.status(200).json(ok(result ?? { ok: false as const, error: 'MCP 未配置' }))
  } catch (error) {
    nativeLog.error('POST /mcp/probe failed', error)
    res.status(200).json(
      ok({
        ok: false as const,
        error: error instanceof Error ? error.message : String(error)
      })
    )
  }
})

mcpRouter.get('/mcp/warmup', (_req, res) => {
  try {
    res.status(200).json(ok(getMcpWarmupStatus()))
  } catch (error) {
    nativeLog.error('GET /mcp/warmup failed', error)
    res.status(200).json(fail(50041, error instanceof Error ? error.message : String(error)))
  }
})

mcpRouter.post('/mcp/warmup', async (req, res) => {
  try {
    const reset = Boolean((req.body as { reset?: boolean } | undefined)?.reset)
    const report = reset ? await onMcpServersChanged() : await startMcpWarmup()
    res.status(200).json(ok(report))
  } catch (error) {
    nativeLog.error('POST /mcp/warmup failed', error)
    res.status(200).json(fail(50042, error instanceof Error ? error.message : String(error)))
  }
})
