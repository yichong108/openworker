/**
 * 组装 npm 发布 staging：standalone 产物 + bin + 临时 package.json。
 * 需在 pnpm build（next build）之后执行。
 *
 * 不用 fs.cpSync / fs.rmSync：Windows 上 pnpm/Next standalone 里的
 * SYMLINKD/junction 指向仓库真实 node_modules，递归删除或按链接拷贝会写穿/删掉依赖。
 */

import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { cpSafe, rmSafe } from './fs-safe.mjs'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const stagingDir = join(packageRoot, '.publish-staging')
const standaloneSrc = join(packageRoot, '.next', 'standalone')
const staticSrc = join(packageRoot, '.next', 'static')
const publicSrc = join(packageRoot, 'public')
const binSrc = join(packageRoot, 'bin', 'ap-web.mjs')

/**
 * @param {string} path
 * @param {string} message
 */
function assertExists(path, message) {
  try {
    lstatSync(path)
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') {
      console.error(`[prepare-standalone] ${message}`)
      process.exit(1)
    }
    throw err
  }
}

assertExists(standaloneSrc, '未找到 .next/standalone，请先运行 pnpm build')
assertExists(staticSrc, '未找到 .next/static，请先运行 pnpm build')
assertExists(binSrc, '未找到 bin/ap-web.mjs')

rmSafe(stagingDir)
mkdirSync(stagingDir, { recursive: true })

const distDir = join(stagingDir, 'standalone-dist')
cpSafe(standaloneSrc, distDir, { skipRoots: [stagingDir] })

/** @param {string} targetDir */
function copyStaticInto(targetDir) {
  const staticDest = join(targetDir, '.next', 'static')
  mkdirSync(dirname(staticDest), { recursive: true })
  cpSafe(staticSrc, staticDest, { skipRoots: [stagingDir] })
}

/** @param {string} targetDir */
function copyPublicInto(targetDir) {
  try {
    lstatSync(publicSrc)
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') return
    throw err
  }
  cpSafe(publicSrc, join(targetDir, 'public'), { skipRoots: [stagingDir] })
}

copyStaticInto(distDir)

const monorepoAppDir = join(distDir, 'apps', 'ap-web')
try {
  const appStat = lstatSync(monorepoAppDir)
  if (appStat.isDirectory() || appStat.isSymbolicLink()) {
    copyStaticInto(monorepoAppDir)
    copyPublicInto(monorepoAppDir)
  }
} catch (err) {
  if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'ENOENT') throw err
  copyPublicInto(distDir)
}

mkdirSync(join(stagingDir, 'bin'), { recursive: true })
cpSafe(binSrc, join(stagingDir, 'bin', 'ap-web.mjs'), { skipRoots: [stagingDir] })

const sourcePkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
const publishPkg = {
  name: sourcePkg.name,
  version: sourcePkg.version,
  description: sourcePkg.description,
  type: 'module',
  bin: {
    'ap-web': './bin/ap-web.mjs'
  },
  files: ['bin', 'standalone-dist'],
  engines: {
    node: '>=22.13.0'
  },
  publishConfig: {
    access: 'public',
    registry: 'https://registry.npmjs.org/'
  },
  license: 'MIT',
  repository: sourcePkg.repository,
  homepage: sourcePkg.homepage,
  bugs: sourcePkg.bugs,
  author: sourcePkg.author,
  keywords: sourcePkg.keywords
}

writeFileSync(join(stagingDir, 'package.json'), `${JSON.stringify(publishPkg, null, 2)}\n`)
console.log(`[prepare-standalone] 已写入 ${stagingDir}`)
