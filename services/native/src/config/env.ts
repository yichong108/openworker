import { bootstrapChannelEnv } from '@openworker/shared/load-env'

/**
 * 始终按 `CHANNEL` 从 shared 渠道表注入（单独启动与 Desktop spawn 同一路径）。
 * spawn 侧只需保证子进程有 `CHANNEL`。
 *
 * 本模块仅做副作用 bootstrap；业务侧直接读 `process.env`。
 */
bootstrapChannelEnv()
