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
import { basename, dirname, join, relative, resolve, sep } from 'node:path'

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
 * rmdir，Windows 上目录被占用时短暂重试；仍失败则留下空目录。
 * @param {string} target
 */
function rmdirSafe(target) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      rmdirSync(target)
      return
    } catch (err) {
      const code = /** @type {NodeJS.ErrnoException} */ (err).code
      if (code === 'ENOENT') return
      if (code !== 'EBUSY' && code !== 'ENOTEMPTY' && code !== 'EPERM') throw err
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (attempt + 1))
    }
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
    rmdirSafe(target)
    return
  }

  unlinkSync(target)
}

/**
 * @typedef {object} CpSafeOptions
 * @property {string[]} [skipRoots] 链接目标落在这些目录内则跳过（避免拷进正在写入的 dest）
 * @property {Set<string>} [skipNames] 跳过这些文件/目录名（如 node_modules）
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
  const skipNames = options.skipNames ?? new Set()
  const walkStack = options.walkStack ?? new Set()
  if (skipNames.has(basename(src))) return
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
      cpSafe(real, dest, { skipRoots, skipNames, walkStack })
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
        if (skipNames.has(name)) continue
        cpSafe(join(src, name), join(dest, name), {
          skipRoots,
          skipNames,
          walkStack
        })
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
 * 若 path 是 node_modules/<pkg> 或 node_modules/@scope/pkg，返回包名；否则 null。
 * @param {string} current
 * @returns {string | null}
 */
export function nodeModulesPackageName(current) {
  const base = basename(current)
  const parent = basename(dirname(current))
  const grand = basename(dirname(dirname(current)))
  if (parent.startsWith('@') && grand === 'node_modules') {
    return `${parent}/${base}`
  }
  if (parent === 'node_modules') {
    return base
  }
  return null
}

/**
 * Next file-trace 会把包的子集落到 `.pnpm/<pkg>@<ver>/node_modules/<pkg>`。
 * pnpm 另外会在 apps/.../node_modules/<pkg> 留指向 store 整包的 junction；
 * 物化时必须用这份 traced 目录，不能 realpath 到完整包。
 * @param {string} root
 * @returns {Map<string, string>}
 */
export function indexTracedPackages(root) {
  /** @type {Map<string, string>} */
  const traced = new Map()
  const pnpmDir = join(root, 'node_modules', '.pnpm')
  let entries
  try {
    entries = readdirSync(pnpmDir)
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') return traced
    throw err
  }

  for (const name of entries) {
    const at = name.indexOf('@', name.startsWith('@') ? 1 : 0)
    if (at <= 0) continue
    const pkgName = name.slice(0, at).replace(/\+/g, '/')
    const pkgPath = join(pnpmDir, name, 'node_modules', ...pkgName.split('/'))
    let stat
    try {
      stat = lstatSync(pkgPath)
    } catch {
      continue
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) continue
    traced.set(pkgName, pkgPath)
  }
  return traced
}

/**
 * 将 root 下指向 root 之外的 symlink/junction 替换为普通文件拷贝，避免后续 rmSync 删到外目录。
 * 外指 node_modules 联接改为 traced 副本，禁止把 pnpm store 里的整包 next/sass 拷进来。
 * @param {string} root
 */
export function materializeExternalLinks(root) {
  const rootResolved = resolve(root)
  const traced = indexTracedPackages(rootResolved)
  /** @type {{ current: string, pkgName: string }[]} */
  const pendingAliases = []

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

        const pkgName = nodeModulesPackageName(current)
        if (pkgName) {
          rmLink(current)
          if (
            traced.has(pkgName) &&
            resolve(traced.get(pkgName)).toLowerCase() !== resolve(current).toLowerCase()
          ) {
            pendingAliases.push({ current, pkgName })
          } else {
            console.warn(`[fs-safe] 跳过外指 node_modules 联接 ${current}（无 traced 副本）`)
          }
          continue
        }

        rmLink(current)
        cpSafe(real, current, { skipRoots: [rootResolved] })
        continue
      }

      if (stat.isDirectory()) walk(current)
    }
  }

  walk(rootResolved)

  for (const { current, pkgName } of pendingAliases) {
    const src = traced.get(pkgName)
    if (!src) continue
    cpSafe(src, current)
  }
}

/**
 * pnpm 在 `.pnpm/node_modules` 再 hoist 一份，standalone 不需要，删掉以免打进发布包。
 * @param {string} root
 */
export function prunePnpmHoistedNodeModules(root) {
  rmSafe(join(root, 'node_modules', '.pnpm', 'node_modules'))
}
