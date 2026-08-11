import { Router, type Router as ExpressRouter } from 'express'
import type { PutUserProfileRequest } from '@openworker/shared'

import { BadRequestError, fail, ok } from '../http/envelope.js'
import { getAuthedUser, requireAuth } from '../middleware/auth.js'
import { getUserProfile, putUserProfile } from '../services/user-profile-service.js'

/**
 * 当前登录用户画像路由（需 JWT）
 *
 * - GET /me/profile
 * - PUT /me/profile
 */
export const userProfileRouter: ExpressRouter = Router()

userProfileRouter.use(requireAuth)

userProfileRouter.get('/me/profile', async (req, res) => {
  try {
    const user = getAuthedUser(req)
    const profile = await getUserProfile(user.id)
    res.status(200).json(ok(profile))
  } catch (error) {
    console.error('[native] GET /me/profile failed', error)
    res.status(200).json(fail(50020, error instanceof Error ? error.message : String(error)))
  }
})

userProfileRouter.put('/me/profile', async (req, res) => {
  try {
    const user = getAuthedUser(req)
    const body = (req.body ?? {}) as PutUserProfileRequest
    const profile = await putUserProfile(user.id, body)
    res.status(200).json(ok(profile))
  } catch (error) {
    if (error instanceof BadRequestError) {
      res.status(200).json(fail(40020, error.message))
      return
    }
    console.error('[native] PUT /me/profile failed', error)
    res.status(200).json(fail(50021, error instanceof Error ? error.message : String(error)))
  }
})
