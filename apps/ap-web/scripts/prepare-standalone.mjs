/**
 * 组装 npm 发布 staging：standalone 产物 + bin + 临时 package.json。
 * 需在 pnpm build（next build）之后执行。
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const stagingDir = join(packageRoot, '.publish-staging')
const standaloneSrc = join(packageRoot, '.next', 'standalone')
const staticSrc = join(packageRoot, '.next', 'static')
const publicSrc = join(packageRoot, 'public')
const binSrc = join(packageRoot, 'bin', 'ap-web.mjs')

if (!existsSync(standaloneSrc)) {
  console.error('[prepare-standalone] 未找到 .next/standalone，请先运行 pnpm build')
  process.exit(1)
}

if (!existsSync(staticSrc)) {
  console.error('[prepare-standalone] 未找到 .next/static，请先运行 pnpm build')
  process.exit(1)
}

if (!existsSync(binSrc)) {
  console.error('[prepare-standalone] 未找到 bin/ap-web.mjs')
  process.exit(1)
}

rmSync(stagingDir, { recursive: true, force: true })
mkdirSync(stagingDir, { recursive: true })

const distDir = join(stagingDir, 'standalone-dist')
cpSync(standaloneSrc, distDir, { recursive: true })

/** @param {string} targetDir */
function copyStaticInto(targetDir) {
  const staticDest = join(targetDir, '.next', 'static')
  mkdirSync(dirname(staticDest), { recursive: true })
  cpSync(staticSrc, staticDest, { recursive: true })
}

/** @param {string} targetDir */
function copyPublicInto(targetDir) {
  if (!existsSync(publicSrc)) return
  cpSync(publicSrc, join(targetDir, 'public'), { recursive: true })
}

copyStaticInto(distDir)

const monorepoAppDir = join(distDir, 'apps', 'ap-web')
if (existsSync(monorepoAppDir)) {
  copyStaticInto(monorepoAppDir)
  copyPublicInto(monorepoAppDir)
} else {
  copyPublicInto(distDir)
}

mkdirSync(join(stagingDir, 'bin'), { recursive: true })
cpSync(binSrc, join(stagingDir, 'bin', 'ap-web.mjs'))

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
