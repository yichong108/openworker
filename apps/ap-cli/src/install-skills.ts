/**
 * ap 初始化：覆盖安装同名 skill，并把 work-data 种子补齐到 .agents/ap-config/work-data。
 * 由 `ap init` 调用；skill 只替换同名目录；
 * work-data 覆盖 `*-template.md`，其余同名文件不覆盖。
 */

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { getPackageRoot } from './env.js'

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
 * 用 `apps/ap-cli/src/skills` 下的各个 skill 覆盖 `startDir/.agents/skills` 中的同名目录。
 *
 * 仅由 `ap init` 调用。目标只允许 `startDir` 下，不向上查找仓库根。
 * 只覆盖源目录中存在的 skill，不删除 `.agents`、`.agents/skills` 或其他无关 skill。
 *
 * @param startDir - 安装目标目录，默认 process.cwd()
 * @returns 安装目标根路径（`startDir/.agents/skills`）
 */
export function installApSkills(startDir: string = process.cwd()): string {
  const packageRoot = getPackageRoot()
  const targetRoot = resolve(startDir)
  const source = join(packageRoot, 'src', 'skills')
  const destRoot = join(targetRoot, '.agents', 'skills')

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
 * 把 `apps/ap-cli/src/work-data` 补齐到 `startDir/.agents/ap-config/work-data`。
 *
 * 目标只允许 `startDir` 下，不向上查找仓库根。
 * `*-template.md` 覆盖已有文件；其余同名文件不覆盖，也不删除目标里多出来的内容。
 *
 * @param startDir - 安装目标目录，默认 process.cwd()
 * @returns 安装目标路径（`startDir/.agents/ap-config/work-data`）
 */
export function installApConfig(startDir: string = process.cwd()): string {
  const packageRoot = getPackageRoot()
  const targetRoot = resolve(startDir)
  const source = join(packageRoot, 'src', 'work-data')
  const dest = join(targetRoot, '.agents', 'ap-config', 'work-data')

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
 * 执行 ap 工作区初始化：skill 与 work-data 都装到 `startDir` 下，不向上查找仓库根。
 *
 * @param startDir - 安装目标目录，默认 process.cwd()
 */
export function installApWorkspace(startDir: string = process.cwd()): void {
  installApSkills(startDir)
  installApConfig(startDir)
}
