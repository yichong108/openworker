import { app } from 'electron'

import {
  applyChannelNativeEnvDefaults,
  getChannelConfig,
  resolveAppChannel
} from '@openworker/shared/load-env'

/**
 * 按渠道设置 Electron 应用身份，使 userData / 任务栏 / 单实例锁与 Dev、Test、Prod 隔离。
 *
 * 须在 `app.ready` 之前、任何 `app.getPath('userData')` 之前执行。
 * 渠道来自项目根 `.env-*`（开发）或打包资源 `openworker.env`（安装包）。
 */
const channelConfig = getChannelConfig(resolveAppChannel())

app.setName(channelConfig.productName)

if (process.platform === 'win32') {
  app.setAppUserModelId(channelConfig.appUserModelId)
}

applyChannelNativeEnvDefaults(channelConfig)
