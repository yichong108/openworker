/**
 * 组装 npm 发布目录：standalone 产物（不含 node_modules）+ bin + 带真实版本号的 package.json。
 * 运行时依赖由用户 `npm install` 安装，避免把 pnpm 的 .pnpm 布局打进包。
 * 需在 pnpm build（next build）之后执行。
 */

import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { cpSafe, rmSafe } from './fs-safe.mjs'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = join(packageRoot, '../..')
const stagingDir = join(packageRoot, '.publish-staging')
const standaloneSrc = join(packageRoot, '.next', 'standalone')
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
      console.error(`[prepare-publish] ${message}`)
      process.exit(1)
    }
    throw err
  }
}

/**
 * 读取 pnpm-workspace.yaml 的 catalog 映射。
 * @param {string} yamlText
 * @returns {Record<string, string>}
 */
function parseCatalog(yamlText) {
  /** @type {Record<string, string>} */
  const catalog = {}
  let inCatalog = false
  for (const rawLine of yamlText.split(/\r?\n/)) {
    if (/^catalog:\s*$/.test(rawLine)) {
      inCatalog = true
      continue
    }
    if (!inCatalog) continue
    if (rawLine.length > 0 && !rawLine.startsWith(' ') && !rawLine.startsWith('\t')) break
    const match = rawLine.match(/^\s+('[^']+'|"[^"]+"|[\w@./+-]+):\s*(.+)$/)
    if (!match) continue
    const key = match[1].replace(/^['"]|['"]$/g, '')
    catalog[key] = match[2].trim()
  }
  return catalog
}

/**
 * 把源码 dependencies 转成可发布的版本号；跳过 workspace:*。
 * @param {Record<string, string>} deps
 * @param {Record<string, string>} catalog
 * @returns {Record<string, string>}
 */
function resolvePublishDependencies(deps, catalog) {
  /** @type {Record<string, string>} */
  const resolved = {}
  for (const [name, spec] of Object.entries(deps)) {
    if (spec.startsWith('workspace:')) continue
    if (spec === 'catalog:' || spec.startsWith('catalog:')) {
      const version = catalog[name]
      if (!version) {
        console.error(`[prepare-publish] catalog 中没有 ${name}`)
        process.exit(1)
      }
      resolved[name] = version
      continue
    }
    resolved[name] = spec
  }
  return resolved
}

assertExists(standaloneSrc, '未找到 .next/standalone，请先运行 pnpm ap-web:build')
assertExists(binSrc, '未找到 bin/ap-web.mjs')

const catalog = parseCatalog(readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8'))
const sourcePkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
const rootPkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
const publishDeps = resolvePublishDependencies(sourcePkg.dependencies ?? {}, catalog)

rmSafe(stagingDir)
mkdirSync(stagingDir, { recursive: true })

const distDir = join(stagingDir, 'standalone-dist')
cpSafe(standaloneSrc, distDir, {
  skipRoots: [stagingDir],
  skipNames: new Set(['node_modules'])
})

mkdirSync(join(stagingDir, 'bin'), { recursive: true })
cpSafe(binSrc, join(stagingDir, 'bin', 'ap-web.mjs'), {
  skipRoots: [stagingDir]
})

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
  license: rootPkg.license ?? 'MIT',
  author: rootPkg.author,
  repository: {
    type: 'git',
    url: 'git+https://github.com/yichong108/openworker.git',
    directory: 'apps/ap-web'
  },
  bugs: {
    url: 'https://github.com/yichong108/openworker/issues'
  },
  homepage: 'https://github.com/yichong108/openworker/tree/main/apps/ap-web',
  dependencies: publishDeps
}

writeFileSync(join(stagingDir, 'package.json'), `${JSON.stringify(publishPkg, null, 2)}\n`)
writeFileSync(join(stagingDir, '.npmignore'), 'node_modules\n')

console.log(`[prepare-publish] 已写入 ${stagingDir}`)
console.log(
  '[prepare-publish] 不执行 npm install：node_modules 不会打进包（files 只有 bin / standalone-dist）'
)
console.log('[prepare-publish] 本机试跑：cd 该目录后 npm install --omit=dev && node bin/ap-web.mjs')
console.log('[prepare-publish] 发布：在该目录执行 npm publish --access public')
