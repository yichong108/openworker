import type { ToolSet } from 'ai'
import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'

import { defineTool, mergeToolSets, type ToolOnTool } from './define-tool.js'
import { ensureWorkspaceExists, resolveSafePath } from './path-guard.js'

const MAX_READ = 500_000

/**
 * 读取工作区内 UTF-8 文本文件。
 *
 * @param workspace - 工作区根目录
 * @param relPath - 相对工作区的文件路径
 * @returns 文件内容；超大文件会截断并附注
 */
export async function readFileTool(workspace: string, relPath: string): Promise<string> {
  const root = ensureWorkspaceExists(workspace)
  const file = resolveSafePath(relPath, root)
  const st = await fs.stat(file)
  if (!st.isFile()) {
    return `不是文件：${relPath}`
  }
  if (st.size > MAX_READ) {
    const fh = await fs.open(file, 'r')
    try {
      const buf = Buffer.alloc(MAX_READ)
      const { bytesRead } = await fh.read(buf, 0, MAX_READ, 0)
      return (
        buf.subarray(0, bytesRead).toString('utf8') +
        `\n\n[已截断：文件共 ${st.size} 字节，仅读取前 ${MAX_READ} 字节]`
      )
    } finally {
      await fh.close()
    }
  }
  return await fs.readFile(file, 'utf8')
}

/** write_file 工具的结构化结果（供时间线渲染 diff；模型侧另映射为短文案） */
export type WriteFileToolResult = {
  path: string
  /** 写入前内容；新建文件时为空字符串 */
  before: string
  /** 写入后内容 */
  after: string
  /** 是否为新建文件（写入前不存在） */
  created: boolean
}

/** 写入观察载荷中 before/after 的最大字符数，避免 IPC/时间线膨胀 */
const MAX_WRITE_DIFF_CHARS = 100_000

/**
 * 截断过长文本并附注原长度，供 diff 观察载荷使用。
 *
 * @param text - 原始文本
 * @returns 可能被截断的文本
 */
function truncateForWriteDiff(text: string): string {
  if (text.length <= MAX_WRITE_DIFF_CHARS) return text
  return (
    text.slice(0, MAX_WRITE_DIFF_CHARS) +
    `\n\n…[已截断：共 ${text.length} 字符，仅保留前 ${MAX_WRITE_DIFF_CHARS} 字符]`
  )
}

/**
 * 写入或覆盖工作区文件，自动创建父目录。
 *
 * 写入前读取旧内容，供宿主按工具名解析 diff；模型上下文摘要由 agent 层 formatToolResultForContext 处理。
 *
 * @param workspace - 工作区根目录
 * @param relPath - 相对路径
 * @param content - 写入内容
 * @returns 含 path / before / after / created 的结构化结果
 */
export async function writeFileTool(
  workspace: string,
  relPath: string,
  content: string
): Promise<WriteFileToolResult> {
  const root = ensureWorkspaceExists(workspace)
  const file = resolveSafePath(relPath, root)

  let before = ''
  let created = true
  try {
    before = await fs.readFile(file, 'utf8')
    created = false
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code
    if (code !== 'ENOENT') throw e
  }

  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, content, 'utf8')
  const relativePath = path.relative(root, file).split(path.sep).join('/')

  return {
    path: relativePath,
    before: truncateForWriteDiff(before),
    after: truncateForWriteDiff(content),
    created
  }
}

/**
 * 删除工作区内单个普通文件（不能删目录）。
 *
 * @param workspace - 工作区根目录
 * @param relPath - 相对路径
 * @returns 操作结果说明
 */
export async function deleteFileTool(workspace: string, relPath: string): Promise<string> {
  const root = ensureWorkspaceExists(workspace)
  const file = resolveSafePath(relPath, root)
  let st
  try {
    st = await fs.stat(file)
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code
    if (code === 'ENOENT') {
      return `文件不存在：${relPath}`
    }
    throw e
  }
  if (!st.isFile()) {
    return `不是文件（不能删除目录）：${relPath}`
  }
  await fs.unlink(file)
  return `已删除：${path.relative(root, file)}`
}

/**
 * 列出目录树（相对路径，深度可配）。
 *
 * @param workspace - 工作区根目录
 * @param relPath - 相对路径；空表示根
 * @param options - depth 等
 * @returns 缩进文本树
 */
export async function listDirTool(
  workspace: string,
  relPath: string,
  options?: { depth?: number }
): Promise<string> {
  const root = ensureWorkspaceExists(workspace)
  const dir = resolveSafePath(relPath || '.', root)
  const st = await fs.stat(dir)
  if (!st.isDirectory()) {
    return `不是目录：${relPath}`
  }
  const depth = Math.min(options?.depth ?? 2, 5)
  const lines: string[] = []
  const skipDir = new Set(['node_modules', '.git', 'dist', 'out', 'release', '.next'])

  async function walk(d: string, dLevel: number, prefix: string) {
    const entries = await fs.readdir(d, { withFileTypes: true })
    for (const e of entries) {
      const full = path.join(d, e.name)
      if (e.isDirectory()) {
        if (skipDir.has(e.name)) {
          lines.push(`${prefix}${e.name}/（子项已省略）`)
          continue
        }
        lines.push(`${prefix}${e.name}/`)
        if (dLevel < depth) {
          await walk(full, dLevel + 1, prefix + '  ')
        }
      } else {
        lines.push(`${prefix}${e.name}`)
      }
    }
  }
  await walk(dir, 0, '')
  return lines.length ? lines.join('\n') : '（空目录）'
}

const GLOB_EXCLUDE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/out/**',
  '**/release/**',
  '**/.next/**',
  '**/coverage/**'
] as const

/** 第二根目录（如 Electron userData）额外排除项 */
const GLOB_EXCLUDE_USERDATA_EXTRA = [
  '**/Cache/**',
  '**/GPUCache/**',
  '**/blob_storage/**',
  '**/skills/.cache/**',
  '**/Code Cache/**',
  '**/DawnGraphiteCache/**'
] as const

async function globFilesUnderRoot(
  rootAbs: string,
  pat: string,
  budget: number,
  exclude: readonly string[]
): Promise<{ relPosix: string[]; hitCap: boolean }> {
  const relPosix: string[] = []
  const iter = fs.glob(pat, {
    cwd: rootAbs,
    exclude: [...exclude]
  })
  for await (const entry of iter) {
    const abs = path.resolve(rootAbs, entry)
    const relToRoot = path.relative(rootAbs, abs)
    if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
      continue
    }
    try {
      const st = await fs.stat(abs)
      if (!st.isFile()) {
        continue
      }
    } catch {
      continue
    }
    relPosix.push(relToRoot.split(path.sep).join('/'))
    if (relPosix.length >= budget) {
      break
    }
  }
  const hitCap = relPosix.length >= budget
  return { relPosix, hitCap }
}

function rootsAreSame(a: string, b: string): boolean {
  return path.normalize(path.resolve(a)) === path.normalize(path.resolve(b))
}

/**
 * 按 glob 模式在工作区（及可选第二根目录）查找文件路径。
 *
 * @param workspace - 工作区根目录
 * @param pattern - Node 风格 glob（相对路径）
 * @param options - maxFiles、userDataRoot（如 Electron userData）
 * @returns 分段路径列表文本
 */
export async function globFilesTool(
  workspace: string,
  pattern: string,
  options?: { maxFiles?: number; userDataRoot?: string | null }
): Promise<string> {
  const root = ensureWorkspaceExists(workspace)
  const pat = pattern.trim()
  if (!pat) {
    return 'pattern 不能为空'
  }
  const norm = pat.replace(/\\/g, '/')
  if (path.isAbsolute(pat)) {
    return '请使用相对于根目录的 glob 模式（不要使用绝对路径）'
  }
  if (norm.split('/').some((seg) => seg === '..')) {
    return 'pattern 不能包含 .. 段'
  }

  const maxFiles = Math.min(Math.max(options?.maxFiles ?? 200, 1), 500)
  const wsBudget = Math.ceil(maxFiles / 2)
  const udBudget = maxFiles - wsBudget

  let wsRel: string[] = []
  let wsHitCap = false
  try {
    const ws = await globFilesUnderRoot(root, pat, wsBudget, GLOB_EXCLUDE)
    wsRel = ws.relPosix
    wsHitCap = ws.hitCap
  } catch (e) {
    return `工作区 glob 失败：${(e as Error).message}`
  }

  let udRel: string[] = []
  let udHitCap = false
  const udRaw = options?.userDataRoot?.trim()
  if (udRaw && udBudget > 0 && !rootsAreSame(root, udRaw)) {
    const udAbs = path.resolve(udRaw)
    try {
      const st = await fs.stat(udAbs)
      if (st.isDirectory()) {
        const excludeUd = [...GLOB_EXCLUDE, ...GLOB_EXCLUDE_USERDATA_EXTRA]
        try {
          const ud = await globFilesUnderRoot(udAbs, pat, udBudget, excludeUd)
          udRel = ud.relPosix
          udHitCap = ud.hitCap
        } catch (e) {
          return (
            (wsRel.length ? `【工作区】\n${wsRel.sort().join('\n')}\n\n` : '') +
            `用户数据目录 glob 失败：${(e as Error).message}`
          )
        }
      }
    } catch {
      // userData doesn't exist or unreadable: ignore
    }
  }

  if (!wsRel.length && !udRel.length) {
    return `无匹配文件：${pattern}`
  }

  const lines: string[] = []
  if (wsRel.length) {
    lines.push('[工作区]\n' + [...wsRel].sort().join('\n'))
  }
  if (udRel.length) {
    lines.push('[用户数据]（相对第二根目录）\n' + [...udRel].sort().join('\n'))
  }

  const truncatedNote =
    wsHitCap || udHitCap ? `\n（最多返回 ${maxFiles} 条，某一分区已达上限）` : ''
  return lines.join('\n\n') + truncatedNote
}

/**
 * 组装 fs 工具（read / write / delete / list / glob）的选项。
 */
export type BuildFsToolsOptions = {
  root: string
  /** 可选第二根目录（如 Electron userData），供 glob 搜索 */
  userDataRoot?: string | null
  /** 工具生命周期观察回调 */
  onTool: ToolOnTool
}

/**
 * 构建工作区 fs 相关 ToolSet。
 *
 * @param options - 工作区根、可选 userData 根与观察回调
 * @returns 含 read_file、write_file 等五项的 ToolSet
 */
export function buildFsTools(options: BuildFsToolsOptions): ToolSet {
  const { root, userDataRoot, onTool } = options

  return mergeToolSets(
    defineTool(
      {
        id: 'read_file',
        description: '读取工作区内 UTF-8 文本文件，路径相对于工作区根目录',
        parameters: z.object({ path: z.string() }),
        execute: ({ path }) => readFileTool(root, path)
      },
      onTool
    ),
    defineTool(
      {
        id: 'write_file',
        description: '写入或覆盖工作区文件，自动创建父目录',
        parameters: z.object({ path: z.string(), content: z.string() }),
        execute: ({ path, content }) => writeFileTool(root, path, content)
      },
      onTool
    ),
    defineTool(
      {
        id: 'delete_file',
        description: '删除工作区内单个普通文件（相对路径）；不能删除目录',
        parameters: z.object({ path: z.string() }),
        execute: ({ path }) => deleteFileTool(root, path)
      },
      onTool
    ),
    defineTool(
      {
        id: 'list_dir',
        description: '列出目录，路径相对或空表示根目录，深度 1–3',
        parameters: z.object({
          path: z.string().optional(),
          depth: z.number().int().min(1).max(3).optional()
        }),
        execute: ({ path, depth }) => listDirTool(root, path || '.', { depth: depth ?? 2 })
      },
      onTool
    ),
    defineTool(
      {
        id: 'glob',
        description: userDataRoot
          ? '按模式在工作区根目录与用户数据根下 glob 匹配文件。仅返回文件路径（不含目录），分「工作区」与「用户数据」两段；模式为 Node 风格如 **/*.ts；两侧均排除 node_modules/.git/dist 及缓存目录'
          : '按模式在工作区根目录下 glob 匹配文件。仅返回文件路径；模式为 Node 风格如 **/*.ts；排除 node_modules/.git/dist 等',
        parameters: z.object({
          pattern: z.string(),
          max_results: z.number().int().min(1).max(500).optional()
        }),
        execute: ({ pattern, max_results }) =>
          globFilesTool(root, pattern, { maxFiles: max_results, userDataRoot })
      },
      onTool
    )
  )
}
