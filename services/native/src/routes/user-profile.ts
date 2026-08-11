import { Router, type Router as ExpressRouter } from 'express'
import type { PutUserProfileRequest } from '@openworker/shared'

import { BadRequestError, fail, ok } from '../http/envelope.js'
import { getUserProfile, putUserProfile } from '../services/user-profile-service.js'

/**
 * 本机画像路由（单租户，无登录）
 *
 * - GET /me/profile
 * - PUT /me/profile
 */
export const userProfileRouter: ExpressRouter = Router()

userProfileRouter.get('/me/profile', async (_req, res) => {
  try {
    const profile = await getUserProfile()
    res.status(200).json(ok(profile))
  } catch (error) {
    console.error('[native] GET /me/profile failed', error)
    res.status(200).json(fail(50020, error instanceof Error ? error.message : String(error)))
  }
})

userProfileRouter.put('/me/profile', async (req, res) => {
  try {
    const body = (req.body ?? {}) as PutUserProfileRequest
    const profile = await putUserProfile(body)
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
