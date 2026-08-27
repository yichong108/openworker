/**
 * postbuild：物化 standalone 外指联接，并补齐 static/public。
 * 完成后 static/public 已补进 standalone。发布目录由 prepare-publish 组装（不含 node_modules）。
 */

import { lstatSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { cpSafe, materializeExternalLinks, prunePnpmHoistedNodeModules } from './fs-safe.mjs'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const standaloneDir = join(packageRoot, '.next', 'standalone')
const staticSrc = join(packageRoot, '.next', 'static')
const publicSrc = join(packageRoot, 'public')

materializeExternalLinks(standaloneDir)
prunePnpmHoistedNodeModules(standaloneDir)

/** @param {string} targetDir */
function copyStaticInto(targetDir) {
  const staticDest = join(targetDir, '.next', 'static')
  mkdirSync(dirname(staticDest), { recursive: true })
  cpSafe(staticSrc, staticDest, { skipRoots: [standaloneDir] })
}

/** @param {string} targetDir */
function copyPublicInto(targetDir) {
  try {
    lstatSync(publicSrc)
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') return
    throw err
  }
  cpSafe(publicSrc, join(targetDir, 'public'), { skipRoots: [standaloneDir] })
}

copyStaticInto(standaloneDir)

const monorepoAppDir = join(standaloneDir, 'apps', 'ap-web')
try {
  const appStat = lstatSync(monorepoAppDir)
  if (appStat.isDirectory() || appStat.isSymbolicLink()) {
    copyStaticInto(monorepoAppDir)
    copyPublicInto(monorepoAppDir)
  }
} catch (err) {
  if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'ENOENT') throw err
  copyPublicInto(standaloneDir)
}
