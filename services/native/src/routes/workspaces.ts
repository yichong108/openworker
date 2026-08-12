import { Router, type Router as ExpressRouter } from 'express'
import type {
  CreateSessionRequest,
  CreateWorkspaceRequest,
  PatchWorkspaceRequest,
  ReorderWorkspacesRequest
} from '@openworker/shared'

import { fail, ok, BadRequestError, NotFoundError } from '../http/envelope.js'
import { createSession, listSessions } from '../services/session-service.js'
import { writeWorkspaceTextFile } from '../services/workspace-file-service.js'
import {
  createWorkspace,
  listWorkspaces,
  patchWorkspace,
  reorderWorkspaces,
  softDeleteWorkspace
} from '../services/workspace-service.js'

/**
 * 工作空间路由（本机单租户）
 *
 * - GET/POST /workspaces
 * - PUT /workspaces/reorder
 * - PATCH/DELETE /workspaces/:id
 * - GET/POST /workspaces/:workspaceId/sessions
 * - PUT /workspaces/:workspaceId/files — 写入工作区相对路径文本文件
 */
export const workspacesRouter: ExpressRouter = Router()

workspacesRouter.get('/workspaces', async (_req, res) => {
  try {
    const list = await listWorkspaces()
    res.status(200).json(ok({ list }))
  } catch (error) {
    console.error('[native] GET /workspaces failed', error)
    res.status(200).json(fail(50010, error instanceof Error ? error.message : String(error)))
  }
})

workspacesRouter.post('/workspaces', async (req, res) => {
  try {
    const body = (req.body ?? {}) as CreateWorkspaceRequest
    const workspace = await createWorkspace(body)
    res.status(200).json(ok({ workspace }))
  } catch (error) {
    if (error instanceof BadRequestError) {
      res.status(200).json(fail(40010, error.message))
      return
    }
    console.error('[native] POST /workspaces failed', error)
    res.status(200).json(fail(50011, error instanceof Error ? error.message : String(error)))
  }
})

workspacesRouter.put('/workspaces/reorder', async (req, res) => {
  try {
    const body = (req.body ?? {}) as ReorderWorkspacesRequest
    const list = await reorderWorkspaces(body.orderedIds)
    res.status(200).json(ok({ list }))
  } catch (error) {
    if (error instanceof BadRequestError) {
      res.status(200).json(fail(40011, error.message))
      return
    }
    console.error('[native] PUT /workspaces/reorder failed', error)
    res.status(200).json(fail(50012, error instanceof Error ? error.message : String(error)))
  }
})

workspacesRouter.patch('/workspaces/:id', async (req, res) => {
  try {
    const body = (req.body ?? {}) as PatchWorkspaceRequest
    const workspace = await patchWorkspace(req.params.id!, body)
    res.status(200).json(ok({ workspace }))
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(200).json(fail(40410, error.message))
      return
    }
    if (error instanceof BadRequestError) {
      res.status(200).json(fail(40012, error.message))
      return
    }
    console.error('[native] PATCH /workspaces/:id failed', error)
    res.status(200).json(fail(50013, error instanceof Error ? error.message : String(error)))
  }
})

workspacesRouter.delete('/workspaces/:id', async (req, res) => {
  try {
    await softDeleteWorkspace(req.params.id!)
    res.status(200).json(ok({ ok: true }))
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(200).json(fail(40410, error.message))
      return
    }
    console.error('[native] DELETE /workspaces/:id failed', error)
    res.status(200).json(fail(50014, error instanceof Error ? error.message : String(error)))
  }
})

workspacesRouter.get('/workspaces/:workspaceId/sessions', async (req, res) => {
  try {
    const list = await listSessions(req.params.workspaceId!)
    res.status(200).json(ok({ list }))
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(200).json(fail(40410, error.message))
      return
    }
    console.error('[native] GET /workspaces/:workspaceId/sessions failed', error)
    res.status(200).json(fail(50020, error instanceof Error ? error.message : String(error)))
  }
})

workspacesRouter.post('/workspaces/:workspaceId/sessions', async (req, res) => {
  try {
    const body = (req.body ?? {}) as CreateSessionRequest
    const session = await createSession(req.params.workspaceId!, body)
    res.status(200).json(ok({ session }))
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(200).json(fail(40410, error.message))
      return
    }
    if (error instanceof BadRequestError) {
      res.status(200).json(fail(40020, error.message))
      return
    }
    console.error('[native] POST /workspaces/:workspaceId/sessions failed', error)
    res.status(200).json(fail(50021, error instanceof Error ? error.message : String(error)))
  }
})

/**
 * 写入工作区内相对路径的 UTF-8 文本文件（自动创建父目录）。
 *
 * Body: `{ path: string, content: string }`
 */
workspacesRouter.put('/workspaces/:workspaceId/files', async (req, res) => {
  try {
    const body = (req.body ?? {}) as { path?: string; content?: string }
    const relativePath = typeof body.path === 'string' ? body.path : ''
    const content = typeof body.content === 'string' ? body.content : null
    if (!relativePath.trim()) {
      res.status(200).json(fail(40030, 'path is required'))
      return
    }
    if (content == null) {
      res.status(200).json(fail(40031, 'content is required'))
      return
    }
    const result = await writeWorkspaceTextFile(req.params.workspaceId!, relativePath, content)
    res.status(200).json(ok(result))
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(200).json(fail(40410, error.message))
      return
    }
    if (error instanceof BadRequestError) {
      res.status(200).json(fail(40032, error.message))
      return
    }
    console.error('[native] PUT /workspaces/:workspaceId/files failed', error)
    res.status(200).json(fail(50030, error instanceof Error ? error.message : String(error)))
  }
})
