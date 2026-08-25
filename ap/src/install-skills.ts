/**
 * ap 初始化：覆盖安装同名 skill，并把 work-data 种子补齐到 .agents/ap-config/work-data。
 * skill 只替换同名目录；work-data 覆盖 `*-template.md`，其余同名文件不覆盖。
 */

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { findWorkspaceRoot, getPackageRoot } from './env.js'

/** work-data 拷贝统计：新增、覆盖模板、跳过的同名文件 */
type WorkDataCopyStats = {
  copied: number
  overwritten: number
  skipped: number
}

/**
 * 判断是否为安装时允许覆盖的 work-data 模板文件。
 *
 * @param fileName - 文件名（不含目录）
 * @returns 是否以 `-template.md` 结尾
 */
function isWorkDataTemplate(fileName: string): boolean {
  return fileName.endsWith('-template.md')
}

/**
 * 递归把 work-data 种子拷到目标。
 *
 * `*-template.md` 始终覆盖；其余已存在的同名文件跳过。
 * 不删除目标里多出来的内容。
 *
 * @param source - 源目录
 * @param dest - 目标目录
 * @returns 新增、覆盖模板与跳过的文件数
 */
function copyWorkDataTree(source: string, dest: string): WorkDataCopyStats {
  mkdirSync(dest, { recursive: true })
  let copied = 0
  let overwritten = 0
  let skipped = 0

  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name)
    const to = join(dest, entry.name)

    if (entry.isDirectory()) {
      const nested = copyWorkDataTree(from, to)
      copied += nested.copied
      overwritten += nested.overwritten
      skipped += nested.skipped
      continue
    }

    const exists = existsSync(to)
    if (exists && !isWorkDataTemplate(entry.name)) {
      skipped += 1
      continue
    }

    cpSync(from, to)
    if (exists) {
      overwritten += 1
    } else {
      copied += 1
    }
  }

  return { copied, overwritten, skipped }
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
  const workspaceRoot = findWorkspaceRoot()
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
 * `*-template.md` 覆盖已有文件；其余同名文件不覆盖，也不删除目标里多出来的内容。
 *
 * @returns 安装目标路径（`.agents/ap-config/work-data`）
 */
export function installApConfig(): string {
  const packageRoot = getPackageRoot()
  const workspaceRoot = findWorkspaceRoot()
  const source = join(packageRoot, 'src', 'work-data')
  const dest = join(workspaceRoot, '.agents', 'ap-config', 'work-data')

  if (!existsSync(source)) {
    throw new Error(`未找到 work-data 源目录: ${source}`)
  }

  const { copied, overwritten, skipped } = copyWorkDataTree(source, dest)
  process.stderr.write(
    `[ap] 已补齐 ap-config/work-data（新增 ${copied}，覆盖 ${overwritten} 个模板，跳过 ${skipped} 个同名文件） → ${dest}\n`
  )
  return dest
}

/**
 * 执行 ap 工作区初始化：覆盖同名 skill，并补齐 ap-config/work-data（模板会覆盖）。
 */
export function installApWorkspace(): void {
  installApSkills()
  installApConfig()
}

const invokedAsScript = Boolean(
  process.argv[1] && /\/install-skills\.(ts|js)$/.test(resolve(process.argv[1]).replace(/\\/g, '/'))
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
