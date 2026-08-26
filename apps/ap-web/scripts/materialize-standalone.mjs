/**
 * 将 .next/standalone 中指向仓库 node_modules 的联接物化成普通文件，
 * 避免下一次清理 .next 时删掉真实依赖。
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { materializeExternalLinks } from './fs-safe.mjs'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const standaloneDir = join(packageRoot, '.next', 'standalone')
materializeExternalLinks(standaloneDir)
