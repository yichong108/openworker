/**
 * Express SSE 响应辅助：写入 AG-UI 事件帧与结束帧
 */

import type { Response } from 'express'

import type { AgentStreamPayload } from './agent-stream.js'

/**
 * 将响应切换为 SSE 模式并刷新头。
 *
 * @param res - Express 响应
 */
export function initSseResponse(res: Response): void {
  res.status(200)
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders()
  }
}

/**
 * 写入一帧 AG-UI 事件。
 *
 * @param res - Express 响应
 * @param payload - sessionId + event
 */
export function writeSsePayload(res: Response, payload: AgentStreamPayload): void {
  if (res.writableEnded) return
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

/**
 * 写入通用 JSON 数据帧（如终端 output）。
 *
 * @param res - Express 响应
 * @param data - 可序列化对象
 * @param event - 可选 SSE event 名
 */
export function writeSseData(res: Response, data: unknown, event?: string): void {
  if (res.writableEnded) return
  if (event) {
    res.write(`event: ${event}\n`)
  }
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

/**
 * 写入结束帧并关闭响应。
 *
 * @param res - Express 响应
 */
export function endSse(res: Response): void {
  if (res.writableEnded) return
  res.write(`event: done\ndata: {}\n\n`)
  res.end()
}
