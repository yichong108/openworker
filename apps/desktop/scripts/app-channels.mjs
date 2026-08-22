/**
 * Desktop 渠道静态表 — 供 electron-builder 脚本读取。
 * 与 `src/shared/app-channels-data.ts` 保持同步。
 */

/** @typedef {'dev' | 'test' | 'prod'} AppChannel */

/** @type {Record<AppChannel, import('../src/shared/app-channels.types').ChannelConfig>} */
export const APP_CHANNELS = {
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
 * 根据环境解析渠道键（构建脚本用，不含 Electron runtime）。
 *
 * @param {{ appChannel?: string, isPackaged?: boolean, buildChannel?: string }} options
 * @returns {AppChannel}
 */
export function resolveChannelKey(options = {}) {
  const buildChannel = options.buildChannel?.trim()
  if (buildChannel && buildChannel in APP_CHANNELS) {
    return /** @type {AppChannel} */ (buildChannel)
  }

  const fromEnv = options.appChannel?.trim()
  if (fromEnv && fromEnv in APP_CHANNELS) {
    return /** @type {AppChannel} */ (fromEnv)
  }

  if (options.isPackaged) return 'prod'
  return 'dev'
}

/**
 * @param {AppChannel} channel
 */
export function getChannelConfig(channel) {
  return APP_CHANNELS[channel]
}
