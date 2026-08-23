# @openworker/desktop

OpenWorker 桌面客户端。每个会话对应有且只有一个独立 agent；使用 AG-UI 协议。**瘦 Main**：Agent 运行时与业务数据面在 `@openworker/native`，Renderer 经 HTTP + SSE 直连 Native。

## 发行渠道

| 命令                      | 应用                     | Native 口 | 数据根               |
| ------------------------- | ------------------------ | --------- | -------------------- |
| `pnpm desktop:dev`        | OpenWorkerDev（未安装）  | 3200      | `~/.openworker-dev`  |
| `pnpm desktop:build:test` | OpenWorkerTest（安装包） | 3201      | `~/.openworker-test` |
| `pnpm desktop:build`      | OpenWorker（正式）       | 3202      | `~/.openworker`      |

Dev 与已安装的 Test 可同时运行；身份、端口、`userData` 与 Native 数据根按渠道隔离。渠道配置内联于 [`packages/shared/src/load-env.ts`](../../packages/shared/src/load-env.ts)，脚本通过 `cross-env CHANNEL=dev|test|prod` 选择。
