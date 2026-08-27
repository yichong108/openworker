/**
 * ap 初始化：覆盖安装同名内置 skill 到 .agents/ap-config/skills，
 * 并把 work-data 种子补齐到 .agents/ap-config/work-data，
 * 以及确保 `.agents/ap-config/ap-config.json` 存在。
 * 由 `ap init` 调用；skill 只替换 ap-config 下同名目录，不写入 `.agents/skills`；
 * work-data 覆盖 `*-template.md`，其余同名文件不覆盖。
 * ap-config.json 仅在首次创建时写入 `data-version: 1`，之后不改该字段及其值。
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { join, resolve } from 'node:path'

import { getPackageRoot } from './env.js'

/** 首次 init 写入的数据版本；再次 init 不得覆盖已有值 */
const INITIAL_DATA_VERSION = 1

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
 * 用 `apps/ap-cli/src/skills` 下的各个 skill 覆盖 `startDir/.agents/ap-config/skills` 中的同名目录。
 *
 * 仅由 `ap init` 调用。目标只允许 `startDir` 下，不向上查找仓库根。
 * 内置 skill 不写入 `.agents/skills`，避免被 Cursor 等外部工具发现。
 * 只覆盖源目录中存在的 skill，不删除 `.agents`、`.agents/skills` 或其他无关 skill。
 *
 * @param startDir - 安装目标目录，默认 process.cwd()
 * @returns 安装目标根路径（`startDir/.agents/ap-config/skills`）
 */
export function installApSkills(startDir: string = process.cwd()): string {
  const packageRoot = getPackageRoot()
  const targetRoot = resolve(startDir)
  const source = join(packageRoot, 'src', 'skills')
  const destRoot = join(targetRoot, '.agents', 'ap-config', 'skills')

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

  process.stderr.write(
    `[ap] 已覆盖安装内置 skill ${skillNames.join(', ') || '(无)'} → ${destRoot}\n`
  )
  return destRoot
}

/**
 * `.agents/ap-config/ap-config.json` 的绝对路径。
 *
 * @param startDir - 安装目标目录
 * @returns 配置文件路径
 */
function getApConfigJsonPath(startDir: string): string {
  return join(resolve(startDir), '.agents', 'ap-config', 'ap-config.json')
}

/**
 * 确保 `.agents/ap-config/ap-config.json` 存在。
 *
 * 文件不存在时写入 `{ "data-version": 1 }`。
 * 已有 `data-version` 时不改该字段及其值；缺该字段时补 1，并保留其余键。
 * 已有文件但不是合法 JSON 对象时跳过，避免覆盖用户数据。
 *
 * @param startDir - 安装目标目录，默认 process.cwd()
 * @returns 配置文件路径
 */
export function ensureApConfigJson(startDir: string = process.cwd()): string {
  const destFile = getApConfigJsonPath(startDir)
  mkdirSync(join(resolve(startDir), '.agents', 'ap-config'), { recursive: true })

  if (!existsSync(destFile)) {
    const initial = { 'data-version': INITIAL_DATA_VERSION }
    writeFileSync(destFile, `${JSON.stringify(initial, null, 2)}\n`, 'utf8')
    process.stderr.write(`[ap] 已写入 ${destFile}（data-version: ${INITIAL_DATA_VERSION}）\n`)
    return destFile
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(destFile, 'utf8')) as unknown
  } catch {
    process.stderr.write(`[ap] 已存在 ${destFile}，内容不是合法 JSON，跳过以免覆盖\n`)
    return destFile
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    process.stderr.write(`[ap] 已存在 ${destFile}，保留现有内容（data-version 未改）\n`)
    return destFile
  }

  const config = parsed as Record<string, unknown>
  if (Object.prototype.hasOwnProperty.call(config, 'data-version')) {
    process.stderr.write(
      `[ap] 已存在 ${destFile}，保留 data-version: ${String(config['data-version'])}\n`
    )
    return destFile
  }

  config['data-version'] = INITIAL_DATA_VERSION
  writeFileSync(destFile, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  process.stderr.write(`[ap] 已为 ${destFile} 补齐 data-version: ${INITIAL_DATA_VERSION}\n`)
  return destFile
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
 * 执行 ap 工作区初始化：skill、work-data 与 ap-config.json 都装到 `startDir` 下，不向上查找仓库根。
 *
 * @param startDir - 安装目标目录，默认 process.cwd()
 */
export function installApWorkspace(startDir: string = process.cwd()): void {
  installApSkills(startDir)
  installApConfig(startDir)
  ensureApConfigJson(startDir)
}
