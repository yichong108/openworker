# @openworker/desktop

OpenWorker 桌面客户端。每个会话对应有且只有一个独立 agent；使用 AG-UI 协议。**瘦 Main**：Agent 运行时与业务数据面在 `@openworker/native`，Renderer 经 HTTP + SSE 直连 Native。

环境变量见 [`.env.example`](.env.example)（`OPENWORKER_NATIVE_*` / `VITE_API_URL`）。
