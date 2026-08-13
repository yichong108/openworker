/**
 * ap 初始化：覆盖安装同名 skill，并把 work-data 种子补齐到 .agents/ap-config/work-data。
 * skill 只替换同名目录；work-data 只补缺失文件，同名不覆盖。
 */

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { findWorkspaceRoot, getPackageRoot } from './env.js'

/**
 * 递归把源目录中尚不存在于目标的文件拷过去。
 *
 * 已存在的同名文件一律跳过，不删除目标里多出来的内容。
 *
 * @param source - 源目录
 * @param dest - 目标目录
 * @returns 新拷贝与跳过的文件数
 */
function copyMissingTree(source: string, dest: string): { copied: number; skipped: number } {
  mkdirSync(dest, { recursive: true })
  let copied = 0
  let skipped = 0

  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name)
    const to = join(dest, entry.name)

    if (entry.isDirectory()) {
      const nested = copyMissingTree(from, to)
      copied += nested.copied
      skipped += nested.skipped
      continue
    }

    if (existsSync(to)) {
      skipped += 1
      continue
    }

    cpSync(from, to)
    copied += 1
  }

  return { copied, skipped }
}

/**
 * 用 `ap/src/skills` 下的各个 skill 覆盖仓库根 `.agents/skills` 中的同名目录。
 *
 * prepare 与每次 CLI 启动都会调用。只覆盖源目录中存在的 skill，
 * 不删除 `.agents`、`.agents/skills` 或其他无关 skill。
 *
 * @returns 安装目标根路径（`.agents/skills`）
 */
export function installApSkills(): string {
  const packageRoot = getPackageRoot()
  const workspaceRoot = findWorkspaceRoot(packageRoot)
  const source = join(packageRoot, 'src', 'skills')
  const destRoot = join(workspaceRoot, '.agents', 'skills')

  if (!existsSync(source)) {
    throw new Error(`未找到 skills 源目录: ${source}`)
  }

  mkdirSync(destRoot, { recursive: true })

  const skillNames: string[] = []
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue

    const skillSource = join(source, entry.name)
    const skillDest = join(destRoot, entry.name)
    rmSync(skillDest, { recursive: true, force: true })
    cpSync(skillSource, skillDest, { recursive: true })
    skillNames.push(entry.name)
  }

  process.stderr.write(`[ap] 已覆盖安装 skill ${skillNames.join(', ') || '(无)'} → ${destRoot}\n`)
  return destRoot
}

/**
 * 把 `ap/src/work-data` 补齐到仓库根 `.agents/ap-config/work-data`。
 *
 * 只拷贝目标中尚不存在的文件；同名文件不覆盖，也不删除目标里多出来的内容。
 *
 * @returns 安装目标路径（`.agents/ap-config/work-data`）
 */
export function installApConfig(): string {
  const packageRoot = getPackageRoot()
  const workspaceRoot = findWorkspaceRoot(packageRoot)
  const source = join(packageRoot, 'src', 'work-data')
  const dest = join(workspaceRoot, '.agents', 'ap-config', 'work-data')

  if (!existsSync(source)) {
    throw new Error(`未找到 work-data 源目录: ${source}`)
  }

  const { copied, skipped } = copyMissingTree(source, dest)
  process.stderr.write(
    `[ap] 已补齐 ap-config/work-data（新增 ${copied}，跳过 ${skipped} 个同名文件） → ${dest}\n`
  )
  return dest
}

/**
 * 执行 ap 工作区初始化：覆盖同名 skill，并补齐 ap-config/work-data。
 */
export function installApWorkspace(): void {
  installApSkills()
  installApConfig()
}

const invokedAsScript = Boolean(
  process.argv[1] && resolve(process.argv[1]).replace(/\\/g, '/').endsWith('/install-skills.ts')
)

if (invokedAsScript) {
  try {
    installApWorkspace()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[ap] ${message}`)
    process.exitCode = 1
  }
}
