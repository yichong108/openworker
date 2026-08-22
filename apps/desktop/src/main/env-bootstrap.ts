/**
 * 在其它主进程模块之前执行：加载渠道环境变量到 `process.env`。
 *
 * - 未打包：项目根 `.env-{APP_CHANNEL}`，无 `APP_CHANNEL` 时默认 `.env-dev`
 * - 已打包：`resources/openworker.env`（构建时从对应 `.env-*` 打入）
 *
 * 合并完成后关闭第三方 LLM 内置追踪（不使用 LangSmith）。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { bootstrapRootChannelEnv, PACKAGED_CHANNEL_ENV_FILE } from '@openworker/shared/load-env'
import { app } from 'electron'
import { parse } from 'dotenv'

function disableThirdPartyLlmTracing(): void {
  process.env.LANGCHAIN_TRACING_V2 = 'false'
  process.env.LANGSMITH_TRACING_V2 = 'false'
}

if (app.isPackaged) {
  const path = join(process.resourcesPath, PACKAGED_CHANNEL_ENV_FILE)
  if (!existsSync(path)) {
    throw new Error(`打包应用缺少渠道环境文件: ${path}`)
  }

  const parsed = parse(readFileSync(path, 'utf8'))
  for (const [k, v] of Object.entries(parsed)) {
    if (v !== undefined) process.env[k] = v
  }
} else {
  bootstrapRootChannelEnv({ defaultChannel: 'dev' })
}

disableThirdPartyLlmTracing()
