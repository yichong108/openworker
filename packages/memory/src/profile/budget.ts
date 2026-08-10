/**
 * 用户画像预算默认值
 */

import type { ProfileBudget } from '../types.js'

/** 默认画像注入约 2k 字符 */
export const DEFAULT_PROFILE_BUDGET: ProfileBudget = {
  profileChars: 2_000
}

/** 单用户最多保留的事实条数 */
export const MAX_PROFILE_FACTS = 64

/**
 * 合并调用方覆盖与默认画像预算。
 *
 * @param partial - 可选覆盖
 * @returns 完整 ProfileBudget
 */
export function resolveProfileBudget(partial?: Partial<ProfileBudget>): ProfileBudget {
  const profileChars =
    typeof partial?.profileChars === 'number' &&
    Number.isFinite(partial.profileChars) &&
    partial.profileChars > 0
      ? Math.floor(partial.profileChars)
      : DEFAULT_PROFILE_BUDGET.profileChars
  return { profileChars }
}
