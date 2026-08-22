/**
 * Desktop 渠道 runtime — 依赖 Electron `app` 解析当前进程渠道。
 */

import { homedir } from 'node:os'
import path from 'node:path'

import { app } from 'electron'

import {
  APP_CHANNELS,
  getChannelConfig as getChannelConfigFromData,
  type AppChannel,
  type ChannelConfig
} from '@/shared/app-channels-data'

export type { AppChannel, ChannelConfig }
export { APP_CHANNELS }

/** 编译期由 electron-vite 注入；打包时与 APP_CHANNEL 一致 */
declare const __APP_CHANNEL__: string

/**
 * 解析当前进程所属渠道。
 *
 * 未打包固定为 dev；已打包以编译期 `__APP_CHANNEL__` 为准（prod 身份冻结）。
 *
 * @returns 当前渠道键
 */
export function resolveChannel(): AppChannel {
  if (!app.isPackaged) return 'dev'

  const built =
    typeof __APP_CHANNEL__ !== 'undefined' && __APP_CHANNEL__
      ? (__APP_CHANNEL__ as AppChannel)
      : undefined
  if (built && built in APP_CHANNELS) return built
  return 'prod'
}

/**
 * 读取指定渠道配置；省略时取当前渠道。
 *
 * @param channel - 渠道键
 * @returns 渠道完整配置
 */
export function getChannelConfig(channel: AppChannel = resolveChannel()): ChannelConfig {
  return getChannelConfigFromData(channel)
}

/**
 * 解析 Native / 业务数据根绝对路径（`~/${dataDirName}`）。
 *
 * @param config - 渠道配置
 * @returns 如 `~/.openworker-dev`
 */
export function getOpenworkerHome(config: ChannelConfig = getChannelConfig()): string {
  return path.join(homedir(), config.dataDirName)
}

/**
 * 按渠道写入默认 Native 环境变量（仅在未显式设置时）。
 *
 * @param config - 渠道配置
 */
export function applyChannelNativeEnvDefaults(config: ChannelConfig = getChannelConfig()): void {
  const port = String(config.nativePort)
  const baseUrl = `http://127.0.0.1:${config.nativePort}`
  const home = getOpenworkerHome(config)

  if (!process.env.OPENWORKER_NATIVE_PORT?.trim() && !process.env.PORT?.trim()) {
    process.env.OPENWORKER_NATIVE_PORT = port
    process.env.PORT = port
  }

  if (!process.env.OPENWORKER_NATIVE_BASE_URL?.trim()) {
    process.env.OPENWORKER_NATIVE_BASE_URL = baseUrl
  }

  if (!process.env.OPENWORKER_HOME?.trim()) {
    process.env.OPENWORKER_HOME = home
  }
}
