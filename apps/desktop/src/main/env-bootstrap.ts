/**
 * 在其它主进程模块之前执行：加载渠道环境变量，并按渠道设置 Electron 应用身份。
 *
 * - 未打包：按 `CHANNEL` 从 shared `load-env` 表注入
 * - 已打包：先用构建期 `__OPENWORKER_CHANNEL__` 设 `CHANNEL`，再 bootstrap
 *
 * 合并完成后关闭第三方 LLM 内置追踪（不使用 LangSmith），
 * 再设置 `app.setName` / Windows `AppUserModelId`，使 userData / 任务栏 / 单实例锁与 Dev、Test、Prod 隔离。
 *
 * 须在 `app.ready` 之前、任何 `app.getPath('userData')` 之前执行。
 */
import { bootstrapChannelEnv } from '@openworker/shared/load-env'
import { app } from 'electron'

function disableThirdPartyLlmTracing(): void {
  process.env.LANGCHAIN_TRACING_V2 = 'false'
  process.env.LANGSMITH_TRACING_V2 = 'false'
}

/**
 * 按渠道环境设置 Electron 应用身份（productName / AppUserModelId）。
 */
function applyAppIdentity(): void {
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
}

if (app.isPackaged) {
  process.env.CHANNEL = __OPENWORKER_CHANNEL__
}

bootstrapChannelEnv()

disableThirdPartyLlmTracing()
applyAppIdentity()
