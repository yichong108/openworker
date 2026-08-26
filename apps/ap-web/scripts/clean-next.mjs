/**
 * 在 next build 之前安全删除 .next。
 * Next 默认 cleanDistDir 用 fs.rmSync，会跟随 standalone 里指向 node_modules 的 junction。
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { rmSafe } from './fs-safe.mjs'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
rmSafe(join(packageRoot, '.next'))
