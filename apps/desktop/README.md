# 心智架构

## 一句话

目前每个会话对应创建有且只有一个各自独立的agent；
使用AG-UI协议，不使用Vercel AI SDK；
瘦Main、让Main稳定，减少重启带来的开发成本。

## 边界与依赖

### Native 本地服务

主进程在 `app.whenReady` 时通过 [`native-service.ts`](src/main/native-service.ts) 拉起 `@openworker/native`（默认 `http://127.0.0.1:3200`）：

- 开发：系统 Node 跑 monorepo 中的 `desktop-bundle.cjs` / `dist`（无则 tsx）
- 安装包：`resources/native/index.js` + `ELECTRON_RUN_AS_NODE=1`（`pnpm desktop:build` 会先 `native:build`）
- `/health` 已就绪则复用，退出时只杀本进程 spawn 的实例
- **数据面**：auth / settings / workspaces / sessions / profile 默认打 Native
- **RAG**：`POST /rag/query` 仍走 `@openworker/api`（默认 `:3100`，`OPENWORKERER_API_BASE_URL`）

环境变量见 [`.env.example`](.env.example)（`OPENWORKER_NATIVE_*` / `VITE_API_URL` / `OPENWORKERER_API_BASE_URL`）。

## 反模式（本模块已出现过/严禁）
