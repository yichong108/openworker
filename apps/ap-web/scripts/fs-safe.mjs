/**
 * Windows 上安全处理含 SYMLINKD/junction 的目录树。
 * pnpm + Next standalone 会留下指向真实 node_modules 的联接，
 * fs.cpSync / fs.rmSync 递归跟随后会写穿或删掉依赖。
 */

import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  rmdirSync,
  unlinkSync
} from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

/**
 * 判断 child 是否位于 parent 目录之内（含自身）。Windows 路径大小写不敏感。
 * @param {string} parent
 * @param {string} child
 */
export function isPathInside(parent, child) {
  const rel = relative(resolve(parent).toLowerCase(), resolve(child).toLowerCase())
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`))
}

/**
 * 只移除 symlink/junction 本身，不跟随目标。
 * @param {string} target
 */
function rmLink(target) {
  try {
    unlinkSync(target)
  } catch (err) {
    const code = /** @type {NodeJS.ErrnoException} */ (err).code
    if (code === 'EPERM' || code === 'EISDIR' || code === 'EACCES') {
      rmdirSync(target)
      return
    }
    throw err
  }
}

/**
 * 按 lstat 删除：遇到 symlink/junction 只 unlink，不走进目标。
 * @param {string} target
 */
export function rmSafe(target) {
  let stat
  try {
    stat = lstatSync(target)
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') return
    throw err
  }

  if (stat.isSymbolicLink()) {
    rmLink(target)
    return
  }

  if (stat.isDirectory()) {
    for (const name of readdirSync(target)) {
      rmSafe(join(target, name))
    }
    rmdirSync(target)
    return
  }

  unlinkSync(target)
}

/**
 * @typedef {object} CpSafeOptions
 * @property {string[]} [skipRoots] 链接目标落在这些目录内则跳过（避免拷进正在写入的 dest）
 * @property {Set<string>} [walkStack] 当前展开路径，用于断开环
 */

/**
 * 把目录树物化拷贝到 dest。外指 symlink/junction 解成普通文件，不在 dest 重建外指链接。
 * @param {string} src
 * @param {string} dest
 * @param {CpSafeOptions} [options]
 */
export function cpSafe(src, dest, options = {}) {
  const skipRoots = options.skipRoots ?? []
  const walkStack = options.walkStack ?? new Set()
  const srcStat = lstatSync(src)

  if (srcStat.isSymbolicLink()) {
    let real
    try {
      real = realpathSync(src)
    } catch {
      console.warn(`[fs-safe] 跳过损坏的链接 ${src}`)
      return
    }
    if (skipRoots.some((root) => isPathInside(root, real))) return
    if (isPathInside(real, dest)) return
    const realKey = resolve(real).toLowerCase()
    if (walkStack.has(realKey)) return
    walkStack.add(realKey)
    try {
      cpSafe(real, dest, { skipRoots, walkStack })
    } finally {
      walkStack.delete(realKey)
    }
    return
  }

  const srcKey = resolve(src).toLowerCase()
  if (walkStack.has(srcKey)) return
  walkStack.add(srcKey)
  try {
    if (srcStat.isDirectory()) {
      mkdirSync(dest, { recursive: true })
      for (const name of readdirSync(src)) {
        cpSafe(join(src, name), join(dest, name), { skipRoots, walkStack })
      }
      return
    }
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(src, dest)
  } finally {
    walkStack.delete(srcKey)
  }
}

/**
 * 将 root 下指向 root 之外的 symlink/junction 替换为普通文件拷贝，避免后续 rmSync 删到外目录。
 * @param {string} root
 */
export function materializeExternalLinks(root) {
  const rootResolved = resolve(root)

  /** @param {string} dir */
  function walk(dir) {
    let entries
    try {
      entries = readdirSync(dir)
    } catch (err) {
      if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') return
      throw err
    }

    for (const name of entries) {
      const current = join(dir, name)
      let stat
      try {
        stat = lstatSync(current)
      } catch (err) {
        if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') continue
        throw err
      }

      if (stat.isSymbolicLink()) {
        let real
        try {
          real = realpathSync(current)
        } catch {
          rmLink(current)
          continue
        }
        if (isPathInside(rootResolved, real)) continue
        rmLink(current)
        cpSafe(real, current, { skipRoots: [rootResolved] })
        continue
      }

      if (stat.isDirectory()) walk(current)
    }
  }

  walk(rootResolved)
}
