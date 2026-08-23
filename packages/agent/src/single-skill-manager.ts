/**
 * 进程内 SkillManager 单例（agent 宿主层）；skills 包仅提供 SkillManager 类。
 */

import { SkillManager } from '@openworker/skills'

let singleSkillManager: SkillManager | null = null

/**
 * 获取进程内 SkillManager 单例（空实例，需 init 后挂 global 并 startWatch）。
 *
 * @returns SkillManager 单例
 */
export function getSingleSkillManager(): SkillManager {
  singleSkillManager ??= new SkillManager()
  return singleSkillManager
}

/**
 * 释放 SkillManager 单例（测试 / 进程退出）。
 */
export function disposeSingleSkillManager(): void {
  singleSkillManager?.dispose()
  singleSkillManager = null
}
