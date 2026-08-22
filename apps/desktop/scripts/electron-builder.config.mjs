import { register } from 'tsx/esm/api'

register()

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  bootstrapRootChannelEnv,
  getRootEnvFilePath,
  PACKAGED_CHANNEL_ENV_FILE
} from '@openworker/shared/load-env'

const __dirname = dirname(fileURLToPath(import.meta.url))
const desktopPkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'))

const channel = bootstrapRootChannelEnv({ startDir: join(__dirname, '..') })

const appId = process.env.OPENWORKER_APP_ID?.trim()
const productName = process.env.OPENWORKER_PRODUCT_NAME?.trim()
const icon = process.env.OPENWORKER_APP_ICON?.trim()

if (!appId || !productName || !icon) {
  throw new Error(
    '打包缺少 OPENWORKER_APP_ID / OPENWORKER_PRODUCT_NAME / OPENWORKER_APP_ICON，请检查渠道环境文件'
  )
}

const baseBuild = desktopPkg.build ?? {}

/** @type {import('electron-builder').Configuration} */
export default {
  ...baseBuild,
  appId,
  productName,
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
    icon
  },
  mac: {
    ...baseBuild.mac,
    icon
  },
  linux: {
    ...baseBuild.linux,
    icon
  }
}
