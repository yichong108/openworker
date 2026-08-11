# 心智架构

## 一句话

每个会话对应创建有且只有一个各自独立的 agent；
使用 AG-UI 协议，不使用 Vercel AI SDK UI；
**瘦 Main**：Agent 运行时与业务数据面在 `@openworker/native`，Renderer 经 HTTP + SSE 直连 Native；Main 仅保留 Electron 壳。

## 边界与依赖

### Native 本地服务

主进程在 `app.whenReady` 时通过 [`native-service.ts`](src/main/native-service.ts) 拉起 `@openworker/native`（默认 `http://127.0.0.1:3200`）：

- 开发：系统 Node 跑 monorepo 中的 `desktop-bundle.cjs` / `dist`（无则 tsx）
- 安装包：`resources/native/index.js` + `ELECTRON_RUN_AS_NODE=1`（`pnpm desktop:build` 会先 `native:build`）
- `/health` 已就绪则复用，退出时只杀本进程 spawn 的实例

### Renderer → Native（直连）

渲染进程通过 [`api/request.ts`](src/renderer/src/api/request.ts) / [`api/native-api.ts`](src/renderer/src/api/native-api.ts) 访问：

- **数据面**：settings / workspaces / sessions / profile（本机单租户，无登录）
- **Agent**：`POST /sessions/:id/agent/run`（SSE 推送 AG-UI 事件）、`POST .../cancel`
- **skills / MCP / 右侧栏终端**：对应 Native HTTP（终端为 SSE）

### Main → Electron 壳（IPC）

仅保留：窗口控制、选目录对话框、工作区文件树/读文件、UI 状态、DevTools、外链等。

环境变量见 [`.env.example`](.env.example)（`OPENWORKER_NATIVE_*` / `VITE_API_URL`）。

## 反模式（本模块已出现过/严禁）
