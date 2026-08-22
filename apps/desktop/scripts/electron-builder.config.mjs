import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { getChannelConfig, resolveChannelKey } from './app-channels.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const desktopPkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'))

const channel = resolveChannelKey({
  appChannel: process.env.APP_CHANNEL,
  isPackaged: true
})
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
