/**
 * 工作区内安全写入相对路径文件（供计划保存等宿主能力使用）。
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { BadRequestError } from '../http/envelope.js'
import { getWorkspace } from './workspace-service.js'

/**
 * 将相对路径解析到工作区根下，禁止逃逸。
 *
 * @param workspaceRoot - 工作区绝对路径
 * @param relativePath - 相对路径（posix 或本地分隔符）
 * @returns 绝对路径
 * @throws {BadRequestError} 路径非法或逃逸工作区
 */
function resolveWorkspaceRelativePath(workspaceRoot: string, relativePath: string): string {
  const trimmed = relativePath.trim().replace(/\\/g, '/')
  if (!trimmed || trimmed.startsWith('/') || /^[a-zA-Z]:/.test(trimmed)) {
    throw new BadRequestError('path 必须是相对工作区根目录的路径')
  }
  if (trimmed.split('/').some((seg) => seg === '..')) {
    throw new BadRequestError('path 不得包含 ..')
  }
  const root = path.resolve(workspaceRoot)
  const abs = path.resolve(root, trimmed)
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep
  if (abs !== root && !abs.startsWith(rootWithSep)) {
    throw new BadRequestError('path 超出工作区范围')
  }
  return abs
}

/**
 * 向指定工作区写入文本文件（自动创建父目录）。
 *
 * @param workspaceId - 工作区 id
 * @param relativePath - 相对工作区根的文件路径
 * @param content - UTF-8 文本内容
 * @returns 写入后的相对路径（posix）
 * @throws {NotFoundError|BadRequestError} 工作区不存在或路径非法
 */
export async function writeWorkspaceTextFile(
  workspaceId: string,
  relativePath: string,
  content: string
): Promise<{ path: string }> {
  const ws = await getWorkspace(workspaceId)
  const root = ws.path?.trim()
  if (!root) {
    throw new BadRequestError('工作区未绑定路径')
  }
  const abs = resolveWorkspaceRelativePath(root, relativePath)
  await mkdir(path.dirname(abs), { recursive: true })
  await writeFile(abs, content, 'utf8')
  return { path: relativePath.trim().replace(/\\/g, '/') }
}
