/**
 * 渠道环境：表内联于本模块，经 `bootstrapChannelEnv` 写入 `process.env`。
 * Desktop / Native 共用同一份表；由 `CHANNEL`（cross-env 或打包 define）选渠道。
 *
 * 合并顺序：`BASE_ENVS` ← `CHANNEL_ENVS[channel]`（渠道覆盖基线）。
 */

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { getNativeSqlitePath } from './path.js'

/** 发行渠道键 */
export const CHANNEL_VALUES = ['dev', 'test', 'prod'] as const

export type AppChannel = (typeof CHANNEL_VALUES)[number]

function isAppChannel(value: string): value is AppChannel {
  return (CHANNEL_VALUES as readonly string[]).includes(value)
}

/**
 * 全渠道共用基线（含 Native 默认端口等）。
 * 各渠道在 `CHANNEL_ENVS` 中覆盖差异项。
 */
const BASE_ENVS: Record<string, string> = {
  OPENWORKER_APP_ICON: 'resources/app-icon.png'
}

/** 模块私有 — 各渠道相对 `BASE_ENVS` 的覆盖项 */
const CHANNEL_ENVS: Record<AppChannel, Record<string, string>> = {
  dev: {
    CHANNEL: 'dev',
    OPENWORKER_PRODUCT_NAME: 'OpenWorkerDev',
    OPENWORKER_APP_ID: 'com.openworker.desktop.dev',
    OPENWORKER_APP_USER_MODEL_ID: 'com.openworker.desktop.dev',
    OPENWORKER_DATA_DIR_NAME: '.openworker-dev',
    OPENWORKER_NATIVE_EXTERNAL: '1',
    OPENWORKER_RENDERER_PORT: '5173',
    OPENWORKER_NATIVE_PORT: '3200',
    PORT: '3200',
    OPENWORKER_NATIVE_BASE_URL: 'http://127.0.0.1:3200',
    VITE_API_URL: 'http://127.0.0.1:3200',
    VITE_OPENWORKER_NATIVE_BASE_URL: 'http://127.0.0.1:3200'
  },
  test: {
    CHANNEL: 'test',
    OPENWORKER_PRODUCT_NAME: 'OpenWorkerTest',
    OPENWORKER_APP_ID: 'com.openworker.desktop.test',
    OPENWORKER_APP_USER_MODEL_ID: 'com.openworker.desktop.test',
    OPENWORKER_APP_ICON: 'resources/app-icon.png',
    OPENWORKER_RENDERER_PORT: '5174',
    OPENWORKER_NATIVE_PORT: '3201',
    PORT: '3201',
    OPENWORKER_DATA_DIR_NAME: '.openworker-test',
    OPENWORKER_NATIVE_BASE_URL: 'http://127.0.0.1:3201',
    VITE_API_URL: 'http://127.0.0.1:3201',
    VITE_OPENWORKER_NATIVE_BASE_URL: 'http://127.0.0.1:3201'
  },
  prod: {
    CHANNEL: 'prod',
    OPENWORKER_PRODUCT_NAME: 'OpenWorker',
    OPENWORKER_APP_ID: 'com.openworker.desktop',
    OPENWORKER_APP_USER_MODEL_ID: 'com.openworker.desktop',
    OPENWORKER_APP_ICON: 'resources/app-icon.png',
    OPENWORKER_RENDERER_PORT: '5173',
    OPENWORKER_NATIVE_PORT: '3202',
    PORT: '3202',
    OPENWORKER_DATA_DIR_NAME: '.openworker',
    OPENWORKER_NATIVE_BASE_URL: 'http://127.0.0.1:3202',
    VITE_API_URL: 'http://127.0.0.1:3202',
    VITE_OPENWORKER_NATIVE_BASE_URL: 'http://127.0.0.1:3202'
  }
}

/**
 * 从起始目录向上查找 monorepo / git 根目录。
 *
 * @param startDir - 起始目录，默认 `process.cwd()`
 */
export function findWorkspaceRoot(startDir: string = process.cwd()): string {
  let dir = startDir
  while (true) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    if (existsSync(join(dir, '.git'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return startDir
    dir = parent
  }
}

/**
 * 按 `process.env.CHANNEL` 合并 `BASE_ENVS` + 渠道表写入 `process.env`（override）。
 * 外部加载渠道环境的唯一入口；之后一律读 `process.env`。
 *
 * @returns 加载后的渠道键
 */
export function bootstrapChannelEnv(): AppChannel {
  const channel = process.env.CHANNEL?.trim()
  if (!channel || !isAppChannel(channel)) {
    throw new Error(`无效的 CHANNEL: "${channel}"，可选值: ${CHANNEL_VALUES.join(', ')}`)
  }

  const table = { ...BASE_ENVS, ...CHANNEL_ENVS[channel] }
  for (const [key, value] of Object.entries(table)) {
    process.env[key] = value
  }

  // Native SQLite：未显式设置时落到 `{OPENWORKER_HOME}/native/native.sqlite`
  if (!process.env.SQLITE_PATH?.trim()) {
    process.env.SQLITE_PATH = getNativeSqlitePath()
  }

  return channel
}

/** @returns `~/${dataDirName}` 绝对路径 */
export function resolveOpenworkerHomeDir(dataDirName: string): string {
  return join(homedir(), dataDirName)
}
