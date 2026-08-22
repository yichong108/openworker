/**
 * 项目根目录渠道环境（`.env-dev` / `.env-test` / `.env-prod`）加载与读取。
 */

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { config } from 'dotenv'

/** 发行渠道键 */
export const APP_CHANNEL_VALUES = ['dev', 'test', 'prod'] as const

export type AppChannel = (typeof APP_CHANNEL_VALUES)[number]

/** 打包后写入 resources 的渠道 env 文件名 */
export const PACKAGED_CHANNEL_ENV_FILE = 'openworker.env'

function isAppChannel(value: string): value is AppChannel {
  return (APP_CHANNEL_VALUES as readonly string[]).includes(value)
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
 * @returns 项目根目录下 `.env-{channel}` 绝对路径
 */
export function getRootEnvFilePath(channel: AppChannel, startDir?: string): string {
  return join(findWorkspaceRoot(startDir), `.env-${channel}`)
}

/**
 * 加载项目根目录 `.env-{channel}` 到 `process.env`。
 *
 * @throws 文件不存在时
 */
export function loadRootChannelEnv(
  channel: AppChannel,
  options: { override?: boolean; startDir?: string } = {}
): void {
  const path = getRootEnvFilePath(channel, options.startDir)
  if (!existsSync(path)) {
    throw new Error(`未找到渠道环境文件: ${path}`)
  }
  config({ path, override: options.override ?? true })
}

/**
 * 按 `process.env.APP_CHANNEL` 或 `defaultChannel` 加载根目录渠道 env。
 *
 * @returns 加载后的渠道键
 */
export function bootstrapRootChannelEnv(
  options: { defaultChannel?: AppChannel; startDir?: string } = {}
): AppChannel {
  const fromEnv = process.env.APP_CHANNEL?.trim()
  if (fromEnv) {
    if (!isAppChannel(fromEnv)) {
      throw new Error(`无效的 APP_CHANNEL: "${fromEnv}"，可选值: ${APP_CHANNEL_VALUES.join(', ')}`)
    }
    loadRootChannelEnv(fromEnv, options)
    return fromEnv
  }

  const channel = options.defaultChannel ?? 'dev'
  loadRootChannelEnv(channel, options)
  return channel
}

/** @returns `~/${dataDirName}` 绝对路径 */
export function resolveOpenworkerHomeDir(dataDirName: string): string {
  return join(homedir(), dataDirName)
}
