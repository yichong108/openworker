/**
 * Skills 列表路由
 */

import { Router, type Router as ExpressRouter } from 'express'

import { listUserSkills } from '../agent/skills.js'
import { fail, ok } from '../http/envelope.js'
import { requireAuth } from '../middleware/auth.js'

/**
 * Skills 路由（需 JWT）
 *
 * - GET /skills — 列出 ~/.openworker/skills
 */
export const skillsRouter: ExpressRouter = Router()

skillsRouter.use(requireAuth)

skillsRouter.get('/skills', async (_req, res) => {
  try {
    const skills = await listUserSkills()
    res.status(200).json(ok({ skills }))
  } catch (error) {
    console.error('[native] GET /skills failed', error)
    res.status(200).json(fail(50040, error instanceof Error ? error.message : String(error)))
  }
})
