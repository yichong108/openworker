/**
 * Native skills 布局：用户目录扫描 + 内置技能复制
 */

import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getBundledSkillsDir } from '@openworker/skills'
import { listSkillsFromPaths, type SkillListItem } from '@openworker/uni-agent'

import { agentLog } from './agent-log.js'
import { getOpenworkerSkillsDir } from './paths.js'

export type { SkillListItem }

/**
 * 列出用户 skills 目录下的可用技能（供输入框 `/` 斜杠菜单）。
 *
 * @returns 技能列表；目录为空或不存在时返回空数组
 */
export async function listUserSkills(): Promise<SkillListItem[]> {
  const skillsDir = getOpenworkerSkillsDir()
  try {
    return await listSkillsFromPaths([skillsDir])
  } catch (err) {
    agentLog.warn('[skills] 列出技能失败:', err)
    return []
  }
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
 * 优先 `process.resourcesPath/skills`（Desktop 安装包），否则 `@openworker/skills` content。
 *
 * @returns 源目录绝对路径；找不到时为 null
 */
export function getSkillsSourceDir(): string | null {
  // Electron 安装包：resources/skills（Desktop extraResources）
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (typeof resourcesPath === 'string' && resourcesPath.trim()) {
    const packaged = path.join(resourcesPath, 'skills')
    if (existsSync(packaged)) return packaged
  }

  const envSource = process.env.OPENWORKER_SKILLS_SOURCE?.trim()
  if (envSource && existsSync(envSource)) return envSource

  // 开发：tsx/ESM 下可用包入口；desktop-bundle CJS 中 import.meta 为空，需回退
  try {
    const fromPackage = getBundledSkillsDir()
    if (fromPackage && existsSync(fromPackage)) return fromPackage
  } catch {
    // ignore
  }

  const candidates = [
    path.resolve(process.cwd(), 'packages/skills/content'),
    path.resolve(process.cwd(), '../../packages/skills/content'),
    path.resolve(process.cwd(), '../packages/skills/content')
  ]
  try {
    const here = path.dirname(fileURLToPath(import.meta.url))
    candidates.push(path.resolve(here, '../../../../packages/skills/content'))
  } catch {
    // CJS bundle 下 import.meta 不可用
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return null
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
