# 渠道环境内联到 load-env + cross-env CHANNEL

## Status

COMPLETED

## Priority

P1

## Dependencies

- None

## Decision Needed

- None

## Context

根目录 `.env-dev` / `.env-test` / `.env-prod` 与 `scripts/with-env.mjs` 作为渠道配置来源；需内联到 shared，并用 `CHANNEL` 选择渠道，使 Desktop 与 Native 共用同一份配置且可单独启动。

## Goal

将渠道环境内联到 `packages/shared/src/load-env.ts`（表私有，`bootstrapChannelEnv` 写入 `process.env`）；脚本用 `cross-env CHANNEL=dev|test|prod`；Desktop spawn Native 只传 `CHANNEL`，Native 自行 bootstrap。

## Scope

### In Scope

- 私有 `CHANNEL_ENVS` + 导出 `bootstrapChannelEnv` / `CHANNEL_VALUES` / `AppChannel`
- `APP_CHANNEL` → `CHANNEL`
- Desktop / Native / vite / builder 调用点与脚本
- 打包态 `__OPENWORKER_CHANNEL__`；去掉 `openworker.env` 打入
- 删除根 `.env-*` 与 `scripts/with-env.mjs`
- 文档 / `turbo.json` / `.env.example`

### Out of Scope

- 改动业务协议或新增渠道键以外的功能

## Implementation

- `packages/shared/src/load-env.ts`：内联三渠道表；`bootstrapChannelEnv` 按 `CHANNEL` 写入 `process.env`
- Desktop：`env-bootstrap`、`electron.vite.config`、`electron-builder`、`native-service`（spawn 只保证 `CHANNEL`）
- Native：`config/env.ts` 始终 bootstrap；`dev.mjs` 不再读盘
- 根 / desktop / native scripts：`cross-env CHANNEL=...`
- 删除 `.env-dev`、`.env-test`、`.env-prod`、`scripts/with-env.mjs`

## Completion

- Status: COMPLETED
- Validation: `pnpm --filter @openworker/shared typecheck`、`native` / `desktop` typecheck、`pnpm lint:fix` 通过
- Notes: spawn 侧只传 `CHANNEL`；Native bundle 含 shared `load-env`，安装包内自行 bootstrap

## Original Plan

### 不变量与目标

- **不变量**：dev/test/prod 的端口、产品名、appId、数据目录、`OPENWORKER_NATIVE_EXTERNAL`（仅 dev）等与现有三份 `.env-*` 一致。
- **共用一份 env**：`apps/desktop` 与 `services/native` 都通过 `@openworker/shared/load-env` 的 `bootstrapChannelEnv` 注入**同一份**私有渠道表；同一 `CHANNEL` 下端口、数据目录、Native URL 必须一致。
- **可单独启动**：
  - 只开 Desktop：`cross-env CHANNEL=dev ...` → 自己 bootstrap；spawn Native 时**只需写入/传递 `CHANNEL`**（外加运行时字段），不负责把整份渠道表塞给子进程。
  - 只开 Native：`cross-env CHANNEL=dev ...` → 自己 bootstrap，不依赖 Desktop 或根 `with-env`。
  - 一起开：根 `pnpm dev` 设 `CHANNEL=dev` 后 turbo 并行；dev 渠道保留 `OPENWORKER_NATIVE_EXTERNAL=1`，Desktop 复用外部 Native，避免抢同一端口。
- **Native 自举**：无论单独启动还是被 Desktop spawn，Native 都根据 `process.env.CHANNEL` 调用 `bootstrapChannelEnv`。
- **命名**：`CHANNEL` 替换 `APP_CHANNEL`。
- **对外 API**：只导出 `bootstrapChannelEnv`（及 `AppChannel` / `CHANNEL_VALUES`）。渠道表不导出。

### 核心 API

```ts
export const CHANNEL_VALUES = ['dev', 'test', 'prod'] as const
export type AppChannel = (typeof CHANNEL_VALUES)[number]
export function bootstrapChannelEnv(options?: { defaultChannel?: AppChannel }): AppChannel
```

### 验证

- typecheck / lint:fix
- 单独 `native:dev`：3200 / `.openworker-dev`
- 单独 `desktop:dev`：renderer 5173，Native URL/端口一致
- 并行 `pnpm dev`：不抢端口（`OPENWORKER_NATIVE_EXTERNAL=1`）
