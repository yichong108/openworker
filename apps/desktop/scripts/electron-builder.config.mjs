import { register } from 'tsx/esm/api'

register()

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  bootstrapRootChannelEnv,
  getChannelConfig,
  getRootEnvFilePath,
  PACKAGED_CHANNEL_ENV_FILE,
  resolveAppChannel
} from '@openworker/shared/load-env'

const __dirname = dirname(fileURLToPath(import.meta.url))
const desktopPkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'))

bootstrapRootChannelEnv({ startDir: join(__dirname, '..') })
const channel = resolveAppChannel()
const channelConfig = getChannelConfig(channel)
const baseBuild = desktopPkg.build ?? {}

/** @type {import('electron-builder').Configuration} */
export default {
  ...baseBuild,
  appId: channelConfig.appId,
  productName: channelConfig.productName,
  directories: {
    ...baseBuild.directories,
    output: `release/${channel}`
  },
  extraResources: [
    ...(baseBuild.extraResources ?? []),
    {
      from: getRootEnvFilePath(channel, join(__dirname, '..')),
      to: PACKAGED_CHANNEL_ENV_FILE
    }
  ],
  win: {
    ...baseBuild.win,
    icon: channelConfig.icon
  },
  mac: {
    ...baseBuild.mac,
    icon: channelConfig.icon
  },
  linux: {
    ...baseBuild.linux,
    icon: channelConfig.icon
  }
}
