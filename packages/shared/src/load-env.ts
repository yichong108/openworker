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

/** 单渠道完整身份与端口约定 */
export type ChannelConfig = {
  channel: AppChannel
  productName: string
  appId: string
  appUserModelId: string
  rendererPort: number
  nativePort: number
  /** 用户主目录下的数据根目录名，如 `.openworker-dev` */
  dataDirName: string
  icon: string
}

/** 打包后写入 resources 的渠道 env 文件名 */
export const PACKAGED_CHANNEL_ENV_FILE = 'openworker.env'

const APP_CHANNEL_ENV = 'APP_CHANNEL'

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
    loadRootChannelEnv(fromEnv as AppChannel, options)
    return fromEnv as AppChannel
  }

  const channel = options.defaultChannel ?? 'dev'
  loadRootChannelEnv(channel, options)
  return channel
}

/**
 * 根据环境 hints 解析渠道键（构建 / 脚本 / 无 Electron 运行时）。
 *
 * @throws 未设置或值无效时
 */
export function resolveChannelKey(
  options: {
    appChannel?: string
    buildChannel?: string
  } = {}
): AppChannel {
  const buildChannel = options.buildChannel?.trim()
  if (buildChannel) {
    if (isAppChannel(buildChannel)) return buildChannel
    throw new Error(
      `无效的 buildChannel: "${buildChannel}"，可选值: ${APP_CHANNEL_VALUES.join(', ')}`
    )
  }

  const fromEnv = options.appChannel?.trim()
  if (fromEnv) {
    if (isAppChannel(fromEnv)) return fromEnv
    throw new Error(
      `无效的 ${APP_CHANNEL_ENV}: "${fromEnv}"，可选值: ${APP_CHANNEL_VALUES.join(', ')}`
    )
  }

  throw new Error(
    `未设置发行渠道：请通过项目根目录 .env-dev / .env-test / .env-prod 设置 ${APP_CHANNEL_ENV}，或使用 scripts/with-env.mjs 加载`
  )
}

/**
 * 从当前进程 `APP_CHANNEL` 解析渠道。
 *
 * @throws 未设置或无效时
 */
export function resolveAppChannel(): AppChannel {
  return resolveChannelKey({ appChannel: process.env[APP_CHANNEL_ENV] })
}

/**
 * 从已加载的 `.env-*` 读取当前渠道配置。
 */
export function getChannelConfig(channel?: AppChannel): ChannelConfig {
  const resolved = channel ?? resolveAppChannel()

  return {
    channel: resolved,
    productName: process.env.OPENWORKER_PRODUCT_NAME!.trim(),
    appId: process.env.OPENWORKER_APP_ID!.trim(),
    appUserModelId: process.env.OPENWORKER_APP_USER_MODEL_ID!.trim(),
    rendererPort: Number(process.env.OPENWORKER_RENDERER_PORT),
    nativePort: Number(process.env.OPENWORKER_NATIVE_PORT),
    dataDirName: process.env.OPENWORKER_DATA_DIR_NAME!.trim(),
    icon: process.env.OPENWORKER_APP_ICON!.trim()
  }
}

/**
 * 按渠道写入默认 Native 环境变量（仅在未显式设置时）。
 */
export function applyChannelNativeEnvDefaults(config: ChannelConfig): void {
  const port = String(config.nativePort)
  const baseUrl = `http://127.0.0.1:${config.nativePort}`

  if (!process.env.OPENWORKER_NATIVE_PORT?.trim() && !process.env.PORT?.trim()) {
    process.env.OPENWORKER_NATIVE_PORT = port
    process.env.PORT = port
  }

  if (!process.env.OPENWORKER_NATIVE_BASE_URL?.trim()) {
    process.env.OPENWORKER_NATIVE_BASE_URL = baseUrl
  }

  if (!process.env[APP_CHANNEL_ENV]?.trim()) {
    process.env[APP_CHANNEL_ENV] = config.channel
  }
}

/** @returns `~/${dataDirName}` 绝对路径 */
export function resolveOpenworkerHomeDir(dataDirName: string): string {
  return join(homedir(), dataDirName)
}
