import { app } from 'electron'

import {
  applyChannelNativeEnvDefaults,
  getChannelConfig,
  resolveChannel
} from '@/shared/app-channels'

/**
 * 按渠道设置 Electron 应用身份，使 userData / 任务栏 / 单实例锁与 Dev、Test、Prod 隔离。
 *
 * 须在 `app.ready` 之前、任何 `app.getPath('userData')` 之前执行。
 * 已打包时身份由编译期 `__APP_CHANNEL__` 冻结，不读运行时 APP_CHANNEL。
 */
const channelConfig = getChannelConfig(resolveChannel())

app.setName(channelConfig.productName)

if (process.platform === 'win32') {
  app.setAppUserModelId(channelConfig.appUserModelId)
}

applyChannelNativeEnvDefaults(channelConfig)
