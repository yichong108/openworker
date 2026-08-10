/**
 * 用户画像 API 共享 DTO
 *
 * 与 @openworker/memory 的 UserFact 形状对齐；服务端透传 JSON，不解析语义。
 */

/**
 * 单条用户事实（跨会话）
 */
export type UserFactDto = {
  key: string
  value: string
  /** 0..1 */
  confidence: number
  /** epoch ms */
  updatedAt: number
  source?: 'llm' | 'explicit'
}

/**
 * GET /me/profile 响应 data
 */
export type UserProfileDto = {
  facts: UserFactDto[]
  /** epoch ms */
  updatedAt: number
}

/**
 * PUT /me/profile 请求体
 */
export type PutUserProfileRequest = {
  facts: UserFactDto[]
}
