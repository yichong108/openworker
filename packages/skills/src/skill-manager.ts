/**
 * 按 pathKey 管理多路 skills 根目录：元数据缓存、渐进加载工具、目录监听。
 */

import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

import { tool, type ToolSet } from 'ai'
import { z } from 'zod'

import {
  MAX_SKILL_MD_SIZE_BYTES,
  parseSkillFrontmatter,
  scanSkillsFromRoot,
  type SkillToolOnTool
} from './load-skills.js'
import { skillsLog } from './logger.js'

/** pathKey（逻辑名）→ 技能根目录绝对路径 */
export type SkillRootDirs = Record<string, string>

/** SkillManager 缓存中的技能元数据 */
export type ManagedSkill = {
  name: string
  description: string
  pathKey: string
  /** 含 SKILL.md 的技能目录绝对路径 */
  skillDirPath: string
  skillFilePath: string
}

export type SkillWatchEvent = {
  type: 'add' | 'remove' | 'change'
  pathKey: string
}

const WATCH_DEBOUNCE_MS = 1000
const TOOL_RESULT_TRUNCATE = 8_000
const GLOBAL_PATH_KEY = 'global'

/**
 * 全局 skills 约定根目录（`~/.agents/skills`），供宿主填入 skillRootDirs。
 *
 * @returns 绝对路径
 */
export function getDefaultGlobalAgentsSkillsDir(): string {
  return path.join(homedir(), '.agents', 'skills')
}

/**
 * 生成渐进披露的技能 prompt 摘要。
 *
 * @param skills - 当前可用技能
 * @returns 提示文本；无技能时为空串
 */
function makeManagedSkillHint(skills: ManagedSkill[]): string {
  if (!skills.length) return ''
  const lines = skills.map(
    (item) => `- ${item.name}: ${item.description} (pathKey: ${item.pathKey})`
  )
  return `可用技能（渐进加载）：\n${lines.join('\n')}\n当用户意图与上述描述匹配时，必须先调用 readSkillFile 读取对应 skill 的完整指令，再按需调用 readSkillRelativeFile 读取附属文件；不要跳过匹配技能而用泛化工具猜测。若用户消息包含独立的 \`/技能名\` token（如 \`/code_review\`），视为显式调用该技能，必须优先 readSkillFile。`
}

/**
 * 解析 skill 目录内的相对路径，禁止逃逸出 skillDirPath。
 *
 * @param skillDirPath - 技能目录绝对路径
 * @param relativePath - 相对路径
 * @returns 绝对路径；非法时返回 null
 */
function resolveSkillRelativePath(skillDirPath: string, relativePath: string): string | null {
  const normalized = relativePath.replace(/\\/g, '/').trim()
  if (!normalized) return null
  const resolved = path.resolve(skillDirPath, normalized)
  const rel = path.relative(skillDirPath, resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null
  return resolved
}

/**
 * 按 pathKey 管理 skills 根目录，提供元数据缓存、渐进加载工具与目录监听。
 */
export class SkillManager {
  private skillRootDirs: SkillRootDirs = {}
  private skillRootDirKeys: string[] = []
  private byName = new Map<string, ManagedSkill>()
  private onTool?: SkillToolOnTool
  private onChange?: (event: SkillWatchEvent) => void
  private watchers = new Map<string, fs.FSWatcher>()
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private watching = false
  private disposed = false
  private initialized = false

  /**
   * 空构造；根目录经 addSkillRootDir / setSkillRootDirs 动态挂载。
   */
  constructor() {}

  /**
   * 注入 onTool；首次调用时挂 global 根并 startWatch。
   *
   * @param onTool - 工具生命周期观察回调
   */
  async init(onTool?: SkillToolOnTool): Promise<void> {
    if (this.disposed) return
    this.onTool = onTool
    if (this.initialized) return
    this.initialized = true
    await this.addSkillRootDir(GLOBAL_PATH_KEY, getDefaultGlobalAgentsSkillsDir())
    this.startWatch()
  }

  /**
   * 列出已缓存技能；可按 pathKey 过滤。
   *
   * @param pathKey - 可选 pathKey 过滤
   * @returns 技能元数据列表
   */
  getSkills(pathKey?: string): ManagedSkill[] {
    if (this.disposed) return []
    const all = [...this.byName.values()]
    if (!pathKey) return all
    return all.filter((item) => item.pathKey === pathKey)
  }

  /**
   * 新增或更新 pathKey → 技能根目录；已 watching 时为该 key 挂 watcher。
   *
   * @param pathKey - 逻辑名
   * @param absDir - 技能根目录绝对路径
   */
  async addSkillRootDir(pathKey: string, absDir: string): Promise<void> {
    if (this.disposed) return
    const trimmedKey = pathKey.trim()
    const trimmedDir = absDir.trim()
    if (!trimmedKey || !trimmedDir) return

    const existing = this.skillRootDirs[trimmedKey]?.trim()
    if (existing === trimmedDir) return

    if (existing) {
      this.unwatchPathKey(trimmedKey)
    }

    if (!(trimmedKey in this.skillRootDirs)) {
      this.skillRootDirKeys.push(trimmedKey)
    }
    this.skillRootDirs[trimmedKey] = trimmedDir

    if (this.watching) {
      this.watchPathKey(trimmedKey)
    }

    await this.refresh()
  }

  /**
   * 移除 pathKey：停 watch、从映射删除并 refresh。
   *
   * @param pathKey - 要移除的逻辑名
   */
  async removeSkillRootDir(pathKey: string): Promise<void> {
    if (this.disposed) return
    const trimmedKey = pathKey.trim()
    if (!trimmedKey || !(trimmedKey in this.skillRootDirs)) return

    this.unwatchPathKey(trimmedKey)
    delete this.skillRootDirs[trimmedKey]
    this.skillRootDirKeys = this.skillRootDirKeys.filter((key) => key !== trimmedKey)

    await this.refresh()
  }

  /**
   * 一次性同步多根（diff 后 add/remove）；顺序以 next 的 key 插入序为准。
   *
   * @param next - 目标 pathKey → 绝对路径映射
   */
  async setSkillRootDirs(next: SkillRootDirs): Promise<void> {
    if (this.disposed) return

    const nextKeys = Object.keys(next)
    for (const key of [...this.skillRootDirKeys]) {
      if (!(key in next)) {
        await this.removeSkillRootDir(key)
      }
    }

    for (const key of nextKeys) {
      const absDir = next[key]?.trim()
      if (!absDir) continue
      await this.addSkillRootDir(key, absDir)
    }

    const ordered: string[] = []
    for (const key of nextKeys) {
      if (key in this.skillRootDirs && !ordered.includes(key)) {
        ordered.push(key)
      }
    }
    this.skillRootDirKeys = ordered
    await this.refresh()
  }

  /**
   * 重新扫描 skillRootDirs 并重建 byName 缓存。
   *
   * @param triggerPathKey - 可选，标识触发来源并用于 watch diff
   */
  async refresh(triggerPathKey?: string): Promise<void> {
    if (this.disposed) return

    const before = triggerPathKey !== undefined ? this.snapshotByPathKey(triggerPathKey) : undefined

    const next = new Map<string, ManagedSkill>()
    for (const pathKey of this.skillRootDirKeys) {
      const absRoot = this.skillRootDirs[pathKey]?.trim()
      if (!absRoot) continue
      const scanned = await scanSkillsFromRoot(absRoot)
      for (const item of scanned) {
        if (next.has(item.name)) continue
        next.set(item.name, {
          name: item.name,
          description: item.description,
          pathKey,
          skillDirPath: item.skillDirPath,
          skillFilePath: item.skillFilePath
        })
      }
    }

    this.byName = next
    skillsLog.info(
      `[SkillManager] refreshed=${next.size} from ${this.skillRootDirKeys.length} root(s)`
    )

    if (triggerPathKey !== undefined && before && this.onChange) {
      this.emitWatchDiff(triggerPathKey, before, this.snapshotByPathKey(triggerPathKey))
    }
  }

  /**
   * 生成注入 system prompt 的摘要与渐进加载工具集。
   *
   * @returns hint 与 ToolSet（readSkillFile / readSkillRelativeFile）
   */
  toPromptAndTools(): { hint: string; tools: ToolSet } {
    if (this.disposed) return { hint: '', tools: {} }
    return {
      hint: makeManagedSkillHint(this.getSkills()),
      tools: this.buildReadTools()
    }
  }

  /**
   * 监听各 pathKey 对应根目录的 SKILL.md 变更。
   *
   * @param onChange - 可选变更回调
   */
  startWatch(onChange?: (event: SkillWatchEvent) => void): void {
    if (this.disposed || this.watching) return
    if (onChange) this.onChange = onChange
    this.watching = true

    for (const pathKey of this.skillRootDirKeys) {
      this.watchPathKey(pathKey)
    }
  }

  /**
   * 停止目录监听，保留缓存与配置。
   */
  stopWatch(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close()
    }
    this.watchers.clear()
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer)
    }
    this.debounceTimers.clear()
    this.onChange = undefined
    this.watching = false
  }

  /**
   * 完整注销：停止监听并清空缓存；之后所有方法 no-op。
   */
  dispose(): void {
    if (this.disposed) return
    this.stopWatch()
    this.byName.clear()
    this.skillRootDirs = {}
    this.skillRootDirKeys = []
    this.onTool = undefined
    this.initialized = false
    this.disposed = true
  }

  private watchPathKey(pathKey: string): void {
    if (this.disposed || this.watchers.has(pathKey)) return
    const absRoot = this.skillRootDirs[pathKey]?.trim()
    if (!absRoot) return

    try {
      const watcher = fs.watch(absRoot, { recursive: true }, () => {
        this.scheduleRefresh(pathKey)
      })
      watcher.on('error', (err) => {
        skillsLog.warn(`[SkillManager] watch error pathKey=${pathKey}:`, err)
      })
      this.watchers.set(pathKey, watcher)
    } catch (err) {
      skillsLog.warn(`[SkillManager] failed to watch pathKey=${pathKey}:`, err)
    }
  }

  private unwatchPathKey(pathKey: string): void {
    const watcher = this.watchers.get(pathKey)
    if (watcher) {
      watcher.close()
      this.watchers.delete(pathKey)
    }
    const timer = this.debounceTimers.get(pathKey)
    if (timer) {
      clearTimeout(timer)
      this.debounceTimers.delete(pathKey)
    }
  }

  private snapshotByPathKey(pathKey: string): Map<string, ManagedSkill> {
    return new Map(this.getSkills(pathKey).map((item) => [item.name, item]))
  }

  private emitWatchDiff(
    pathKey: string,
    before: Map<string, ManagedSkill>,
    after: Map<string, ManagedSkill>
  ): void {
    if (!this.onChange) return
    for (const [name, skill] of after) {
      const prev = before.get(name)
      if (!prev) {
        this.onChange({ type: 'add', pathKey })
        continue
      }
      if (
        prev.description !== skill.description ||
        prev.skillFilePath !== skill.skillFilePath ||
        prev.skillDirPath !== skill.skillDirPath
      ) {
        this.onChange({ type: 'change', pathKey })
      }
    }
    for (const name of before.keys()) {
      if (!after.has(name)) {
        this.onChange({ type: 'remove', pathKey })
      }
    }
  }

  private scheduleRefresh(pathKey: string): void {
    if (this.disposed) return
    const existing = this.debounceTimers.get(pathKey)
    if (existing) clearTimeout(existing)
    this.debounceTimers.set(
      pathKey,
      setTimeout(() => {
        this.debounceTimers.delete(pathKey)
        void this.refresh(pathKey)
      }, WATCH_DEBOUNCE_MS)
    )
  }

  private buildReadTools(): ToolSet {
    const readSkillFile = tool({
      description:
        'Read the full SKILL.md body for a skill by its normalized name. Call this when a skill matches the user intent.',
      parameters: z.object({
        skillName: z.string().describe('Normalized skill name, e.g. code_review')
      }),
      execute: async (input) => {
        const skillName = sanitizeSkillNameInput(input.skillName)
        return this.runTool('readSkillFile', { skillName }, async () => {
          const skill = this.byName.get(skillName)
          if (!skill) {
            return `Skill not found: ${skillName}. Available: ${[...this.byName.keys()].join(', ') || '(none)'}`
          }
          try {
            const st = await fsPromises.stat(skill.skillFilePath)
            if (st.size > MAX_SKILL_MD_SIZE_BYTES) {
              return `Skill file too large: ${skill.skillFilePath}`
            }
            const rawMd = await fsPromises.readFile(skill.skillFilePath, 'utf8')
            const parsed = parseSkillFrontmatter(rawMd)
            if (!parsed) return `Invalid SKILL.md (missing frontmatter): ${skill.skillFilePath}`
            return parsed.body
          } catch (err) {
            return `Failed to read skill file: ${String(err)}`
          }
        })
      }
    })

    const readSkillRelativeFile = tool({
      description:
        'Read a file relative to a skill directory (references, scripts, etc.). Requires skillName and relativePath.',
      parameters: z.object({
        skillName: z.string().describe('Normalized skill name'),
        relativePath: z
          .string()
          .describe('Path relative to the skill directory, e.g. references/guide.md')
      }),
      execute: async (input) => {
        const skillName = sanitizeSkillNameInput(input.skillName)
        const relativePath = input.relativePath.trim()
        return this.runTool('readSkillRelativeFile', { skillName, relativePath }, async () => {
          const skill = this.byName.get(skillName)
          if (!skill) {
            return `Skill not found: ${skillName}. Available: ${[...this.byName.keys()].join(', ') || '(none)'}`
          }
          const absPath = resolveSkillRelativePath(skill.skillDirPath, relativePath)
          if (!absPath) {
            return `Invalid relative path (must stay within skill directory): ${relativePath}`
          }
          try {
            const st = await fsPromises.stat(absPath)
            if (!st.isFile()) return `Not a file: ${relativePath}`
            if (st.size > MAX_SKILL_MD_SIZE_BYTES) {
              return `File too large: ${relativePath}`
            }
            return await fsPromises.readFile(absPath, 'utf8')
          } catch (err) {
            return `Failed to read file: ${String(err)}`
          }
        })
      }
    })

    return { readSkillFile, readSkillRelativeFile }
  }

  private async runTool<T>(
    name: string,
    args: Record<string, string>,
    fn: () => Promise<T>
  ): Promise<T> {
    if (this.disposed) {
      return 'SkillManager disposed' as T
    }

    const onTool = this.onTool
    const id = `${name}-${Date.now()}`
    const startedAt = Date.now()
    let argsStr: string
    try {
      argsStr = JSON.stringify(args)
    } catch {
      argsStr = String(args)
    }

    onTool?.({
      id,
      name,
      status: 'start',
      args: argsStr,
      timestampMs: startedAt
    })

    const result = await fn()
    const resultStr = typeof result === 'string' ? result : String(result)
    const truncated = resultStr.slice(0, TOOL_RESULT_TRUNCATE)

    onTool?.({
      id,
      name,
      status: 'end',
      result: truncated,
      timestampMs: Date.now(),
      durationMs: Date.now() - startedAt
    })

    return result
  }
}

function sanitizeSkillNameInput(input: string): string {
  return input.trim()
}
