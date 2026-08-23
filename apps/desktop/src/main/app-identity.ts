import { app } from 'electron'

/**
 * 按渠道设置 Electron 应用身份，使 userData / 任务栏 / 单实例锁与 Dev、Test、Prod 隔离。
 *
 * 须在 `app.ready` 之前、任何 `app.getPath('userData')` 之前执行。
 * 身份字段来自 `env-bootstrap` 已通过 `bootstrapChannelEnv` 注入的渠道环境。
 */
const productName = process.env.OPENWORKER_PRODUCT_NAME?.trim()
const appUserModelId = process.env.OPENWORKER_APP_USER_MODEL_ID?.trim()

if (!productName) {
  throw new Error('未设置 OPENWORKER_PRODUCT_NAME，请检查渠道环境（load-env）')
}
if (!appUserModelId) {
  throw new Error('未设置 OPENWORKER_APP_USER_MODEL_ID，请检查渠道环境（load-env）')
}

app.setName(productName)

if (process.platform === 'win32') {
  app.setAppUserModelId(appUserModelId)
}
