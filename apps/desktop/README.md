# @openworker/desktop

OpenWorker 桌面客户端。每个会话对应有且只有一个独立 agent；使用 AG-UI 协议。**瘦 Main**：Agent 运行时与业务数据面在 `@openworker/native`，Renderer 经 HTTP + SSE 直连 Native。

## 发行渠道

| 命令                      | 应用                      | Native 口 | 数据根               |
| ------------------------- | ------------------------- | --------- | -------------------- |
| `pnpm desktop:dev`        | OpenWorker Dev（未安装）  | 3200      | `~/.openworker-dev`  |
| `pnpm desktop:build:test` | OpenWorker Test（安装包） | 3201      | `~/.openworker-test` |
| `pnpm desktop:build`      | OpenWorker（正式）        | 3202      | `~/.openworker`      |

Dev 与已安装的 Test 可同时运行；身份、端口、`userData` 与 Native 数据根按渠道隔离。渠道表见 [`src/shared/app-channels-data.ts`](src/shared/app-channels-data.ts)（构建脚本 [`scripts/app-channels.mjs`](scripts/app-channels.mjs) 需同步）。

环境变量见 [`.env.example`](.env.example)（`APP_CHANNEL` / `OPENWORKER_NATIVE_*` / `VITE_API_URL`）。
