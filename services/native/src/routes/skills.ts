/**
 * Skills 列表路由
 */

import { Router, type Router as ExpressRouter } from 'express'

import { listUserSkills } from '../agent/skills.js'
import { fail, ok } from '../http/envelope.js'

/**
 * 从 query 中读取单个字符串参数。
 *
 * @param value - Express query 值
 * @returns 修剪后的字符串；缺省为空串
 */
function readQueryString(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0].trim()
  return ''
}

/**
 * Skills 路由（本机单租户）
 *
 * - GET /skills?workspaceId= — 列出 openworker-skills + ~/.agents/skills + 工作区 .agents/skills
 */
export const skillsRouter: ExpressRouter = Router()

skillsRouter.get('/skills', async (req, res) => {
  try {
    const workspaceId = readQueryString(req.query.workspaceId)
    const skills = await listUserSkills(workspaceId || undefined)
    res.status(200).json(ok({ skills }))
  } catch (error) {
    console.error('[native] GET /skills failed', error)
    res.status(200).json(fail(50040, error instanceof Error ? error.message : String(error)))
  }
})
