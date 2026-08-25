/**
 * Native skills 布局：用户目录扫描 + 内置技能复制
 */

import fs from 'node:fs/promises'
import path from 'node:path'

import { getOpenworkerSkillsDir, resolveBundledSkillsContentDir } from '@openworker/shared/load-env'
import {
  getDefaultGlobalAgentsSkillsDir,
  listSkillsFromPaths,
  type SkillListItem
} from '@openworker/skills'

import { NotFoundError } from '../http/envelope.js'
import { getWorkspace } from '../services/workspace-service.js'
import { agentLog } from '../logger.js'

export type { SkillListItem }

type SkillSourceTag = 'openworker' | 'global' | 'project'

/**
 * 从单个技能根目录列出技能，并将 `source` 标为逻辑来源。
 *
 * @param absRoot - 技能根目录绝对路径
 * @param source - 来源标签（openworker / global / project）
 * @returns 技能列表；目录不存在或扫描失败时为空数组
 */
async function listSkillsFromRootTagged(
  absRoot: string,
  source: SkillSourceTag
): Promise<SkillListItem[]> {
  try {
    const items = await listSkillsFromPaths([absRoot])
    return items.map((item) => ({ ...item, source }))
  } catch (err) {
    agentLog.warn(`[skills] 列出技能失败 (${source}):`, absRoot, err)
    return []
  }
}

/**
 * 列出可用技能（供输入框 `/` 斜杠菜单）。
 *
 * 扫描顺序（同名先出现者保留）：
 * 1. `openworker-skills`（原有用户目录）
 * 2. `~/.agents/skills`（global）
 * 3. `{workspace}/.agents/skills`（当前工作区；需有效 path）
 *
 * @param workspaceId - 可选工作区 id；无效或不存在 path 时跳过第 3 路
 * @returns 技能列表（name / description / source）
 */
export async function listUserSkills(workspaceId?: string): Promise<SkillListItem[]> {
  const roots: Array<{ dir: string; source: SkillSourceTag }> = [
    { dir: getOpenworkerSkillsDir(), source: 'openworker' },
    { dir: getDefaultGlobalAgentsSkillsDir(), source: 'global' }
  ]

  const trimmedId = workspaceId?.trim()
  if (trimmedId) {
    try {
      const ws = await getWorkspace(trimmedId)
      const wsPath = ws.path?.trim()
      if (wsPath) {
        roots.push({
          dir: path.join(wsPath, '.agents', 'skills'),
          source: 'project'
        })
      }
    } catch (err) {
      if (!(err instanceof NotFoundError)) {
        agentLog.warn('[skills] 解析工作区失败:', trimmedId, err)
      }
    }
  }

  const seen = new Set<string>()
  const out: SkillListItem[] = []
  for (const { dir, source } of roots) {
    const items = await listSkillsFromRootTagged(dir, source)
    for (const item of items) {
      if (seen.has(item.name)) continue
      seen.add(item.name)
      out.push(item)
    }
  }
  return out
}

/**
 * 递归复制目录及其内容
 *
 * @param src - 源目录
 * @param dest - 目标目录
 */
async function copyDirRecursive(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath)
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath)
    }
  }
}

/**
 * 解析内置技能源目录。
 *
 * @returns 源目录绝对路径；找不到时为 null
 */
export function getSkillsSourceDir(): string | null {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  let moduleUrl: string | undefined
  try {
    moduleUrl = import.meta.url
  } catch {
    // CJS bundle 下 import.meta 不可用
  }

  return resolveBundledSkillsContentDir({
    resourcesPath: typeof resourcesPath === 'string' ? resourcesPath : undefined,
    moduleUrl
  })
}

/**
 * 创建用户 `skills` 目录，并将内置技能复制到用户目录。
 */
export async function ensureUserSkillsLayout(): Promise<void> {
  const targetSkillsPath = getOpenworkerSkillsDir()
  await fs.mkdir(targetSkillsPath, { recursive: true })

  const builtinSkillsPath = getSkillsSourceDir()
  if (!builtinSkillsPath) {
    agentLog.warn('[skills] 未找到内置技能目录, 跳过复制')
    return
  }

  try {
    await fs.access(builtinSkillsPath)
    await copyDirRecursive(builtinSkillsPath, targetSkillsPath)
    agentLog.info('[skills] 已将内置技能复制到用户目录:', targetSkillsPath)
  } catch {
    agentLog.warn('[skills] 未找到内置技能目录, 跳过复制:', builtinSkillsPath)
  }
}
