/**
 * 渠道静态表（无 Electron 依赖）— 供主进程 runtime 与 electron-vite 构建共用。
 */

import type { AppChannel, ChannelConfig } from '@/shared/app-channels.types'

export type { AppChannel, ChannelConfig }

/** 各渠道静态配置 */
export const APP_CHANNELS: Record<AppChannel, ChannelConfig> = {
  dev: {
    channel: 'dev',
    productName: 'OpenWorker Dev',
    appId: 'com.openworker.desktop.dev',
    appUserModelId: 'com.openworker.desktop.dev',
    rendererPort: 5173,
    nativePort: 3200,
    dataDirName: '.openworker-dev',
    icon: 'resources/app-icon.png'
  },
  test: {
    channel: 'test',
    productName: 'OpenWorker Test',
    appId: 'com.openworker.desktop.test',
    appUserModelId: 'com.openworker.desktop.test',
    rendererPort: 5174,
    nativePort: 3201,
    dataDirName: '.openworker-test',
    icon: 'resources/app-icon.png'
  },
  prod: {
    channel: 'prod',
    productName: 'OpenWorker',
    appId: 'com.openworker.desktop',
    appUserModelId: 'com.openworker.desktop',
    rendererPort: 5173,
    nativePort: 3202,
    dataDirName: '.openworker',
    icon: 'resources/app-icon.png'
  }
}

/**
 * 根据环境解析渠道键（构建脚本 / 未加载 Electron 时使用）。
 *
 * @param options - 环境 hints
 * @returns 渠道键
 */
export function resolveChannelKey(
  options: {
    appChannel?: string
    isPackaged?: boolean
    buildChannel?: string
  } = {}
): AppChannel {
  const buildChannel = options.buildChannel?.trim()
  if (buildChannel && buildChannel in APP_CHANNELS) {
    return buildChannel as AppChannel
  }

  const fromEnv = options.appChannel?.trim()
  if (fromEnv && fromEnv in APP_CHANNELS) {
    return fromEnv as AppChannel
  }

  if (options.isPackaged) return 'prod'
  return 'dev'
}

/**
 * 读取指定渠道配置。
 *
 * @param channel - 渠道键
 * @returns 渠道完整配置
 */
export function getChannelConfig(channel: AppChannel): ChannelConfig {
  return APP_CHANNELS[channel]
}
