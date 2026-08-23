/**
 * 渠道环境：表内联于本模块，经 `bootstrapChannelEnv` 写入 `process.env`。
 * Desktop / Native 共用同一份表；由 `CHANNEL`（cross-env 或打包 define）选渠道。
 */

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** 发行渠道键 */
export const CHANNEL_VALUES = ['dev', 'test', 'prod'] as const

export type AppChannel = (typeof CHANNEL_VALUES)[number]

function isAppChannel(value: string): value is AppChannel {
  return (CHANNEL_VALUES as readonly string[]).includes(value)
}

/** 模块私有 — desktop / native 的共用唯一来源 */
const CHANNEL_ENVS: Record<AppChannel, Record<string, string>> = {
  dev: {
    CHANNEL: 'dev',
    OPENWORKER_PRODUCT_NAME: 'OpenWorkerDev',
    OPENWORKER_APP_ID: 'com.openworker.desktop.dev',
    OPENWORKER_APP_USER_MODEL_ID: 'com.openworker.desktop.dev',
    OPENWORKER_APP_ICON: 'resources/app-icon.png',
    OPENWORKER_RENDERER_PORT: '5173',
    OPENWORKER_NATIVE_PORT: '3200',
    PORT: '3200',
    OPENWORKER_DATA_DIR_NAME: '.openworker-dev',
    OPENWORKER_NATIVE_BASE_URL: 'http://127.0.0.1:3200',
    VITE_API_URL: 'http://127.0.0.1:3200',
    VITE_OPENWORKER_NATIVE_BASE_URL: 'http://127.0.0.1:3200',
    OPENWORKER_NATIVE_EXTERNAL: '1'
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
 * 按 `process.env.CHANNEL`（或 `defaultChannel`）选表项写入 `process.env`（override）。
 * 外部加载渠道环境的唯一入口；之后一律读 `process.env`。
 *
 * @returns 加载后的渠道键
 */
export function bootstrapChannelEnv(options: { defaultChannel?: AppChannel } = {}): AppChannel {
  const fromEnv = process.env.CHANNEL?.trim()
  let channel: AppChannel
  if (fromEnv) {
    if (!isAppChannel(fromEnv)) {
      throw new Error(`无效的 CHANNEL: "${fromEnv}"，可选值: ${CHANNEL_VALUES.join(', ')}`)
    }
    channel = fromEnv
  } else {
    channel = options.defaultChannel ?? 'dev'
  }

  const table = CHANNEL_ENVS[channel]
  for (const [key, value] of Object.entries(table)) {
    process.env[key] = value
  }
  return channel
}

/** @returns `~/${dataDirName}` 绝对路径 */
export function resolveOpenworkerHomeDir(dataDirName: string): string {
  return join(homedir(), dataDirName)
}
