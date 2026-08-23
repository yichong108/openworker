/**
 * 在其它主进程模块之前执行：加载渠道环境变量到 `process.env`。
 *
 * - 未打包：按 `CHANNEL` 从 shared `load-env` 表注入
 * - 已打包：先用构建期 `__OPENWORKER_CHANNEL__` 设 `CHANNEL`，再 bootstrap
 *
 * 合并完成后关闭第三方 LLM 内置追踪（不使用 LangSmith）。
 */
import { bootstrapChannelEnv } from '@openworker/shared/load-env'
import { app } from 'electron'

function disableThirdPartyLlmTracing(): void {
  process.env.LANGCHAIN_TRACING_V2 = 'false'
  process.env.LANGSMITH_TRACING_V2 = 'false'
}

if (app.isPackaged) {
  process.env.CHANNEL = __OPENWORKER_CHANNEL__
}

bootstrapChannelEnv()

disableThirdPartyLlmTracing()
