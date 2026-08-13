# @openworker/native

OpenWorker 本地 Native 服务（Node.js + Express + SQLite）。

为 Desktop 提供：

1. **数据面**：设置、工作区/会话、本机画像（单租户，无登录）
2. **Agent 运行时**：会话级 UniAgent、AG-UI SSE 流、skills / MCP / 终端

存储为 SQLite，**无 MySQL / Redis / RAG**；本机单租户（schema v2），无用户/JWT。SQLite 使用 Node 内置 [`node:sqlite`](https://nodejs.org/api/sqlite.html)（`DatabaseSync`），无需编译原生插件；需要 Node.js ≥ 22.5。

## 快速开始

```bash
# 在仓库根目录安装依赖
pnpm install

# 启动开发服务
pnpm native:dev
```

默认监听 `http://127.0.0.1:3200`（仅绑定回环地址）。

## HTTP 端点

本机单租户：业务路由无需 Bearer。仅绑定 `127.0.0.1`。

### 数据面

| Method           | Path                                | 说明                |
| ---------------- | ----------------------------------- | ------------------- |
| `GET`            | `/health`                           | SQLite 探活         |
| `GET`/`PUT`      | `/settings`                         | 全局 AppSettings    |
| `GET`/`PUT`      | `/me/profile`                       | 本机画像（单行）    |
| `GET`/`POST`     | `/workspaces`                       | 工作区列表/创建     |
| `PUT`            | `/workspaces/reorder`               | 重排                |
| `PATCH`/`DELETE` | `/workspaces/:id`                   | 更新/软删           |
| `GET`/`POST`     | `/workspaces/:workspaceId/sessions` | 会话列表/创建       |
| `PATCH`/`DELETE` | `/sessions/:id`                     | 重命名·touch / 软删 |
| `GET`/`PUT`      | `/sessions/:id/messages`            | 消息整包读写        |

### Agent / 工具面

| Method       | Path                         | 说明                                                                                                    |
| ------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| `POST`       | `/sessions/:id/agent/run`    | Body `{ text, mode?, planMarkdown?, ... }`；**SSE** 推 AG-UI 事件；`mode` 为 `build` \| `ask` \| `plan` |
| `PUT`        | `/workspaces/:id/files`      | Body `{ path, content }`；写入工作区相对路径文本（计划「保存到工作区」等）                              |
| `POST`       | `/sessions/:id/agent/cancel` | 取消当前 run                                                                                            |
| `GET`        | `/skills`                    | 列出 `~/.openworker/skills`                                                                             |
| `POST`       | `/mcp/probe`                 | 探测 MCP 工具                                                                                           |
| `GET`/`POST` | `/mcp/warmup`                | 读/跑 MCP 池化预热                                                                                      |
| `POST`       | `/terminal/run`              | 右侧栏终端；**SSE** 推 stdout/stderr                                                                    |
| `POST`       | `/terminal/cancel`           | 取消终端                                                                                                |
| `POST`       | `/terminal/complete`         | 路径补全                                                                                                |

响应格式：多数 `{ code, message, data }`；settings 为 `{ data }`；health 为 `{ status, timestamp, checks }`；SSE 为 `text/event-stream`（结束帧 `event: done`）。

## SQLite 路径与表

默认数据库文件：

```text
~/.openworker/native/native.sqlite
```

业务表（schema v2）：`app_settings`、`workspaces`、`sessions`、`user_profiles`（本机单行画像，`id=default`）；`_meta` 含 `schema_version`。不含 `users` / 知识库表。

启动时若检测到旧多用户库，会将 `admin`（或最早用户）的数据迁移到单租户表。异常半迁移时可删除 `native.sqlite` 后冷启动。

可选覆盖（例如单测隔离）：

```bash
# services/native/.env
SQLITE_PATH=./data/native.sqlite
```

## 健康检查

```bash
curl http://127.0.0.1:3200/health
```

成功示例：

```json
{
  "status": "ok",
  "timestamp": "2026-08-12T00:00:00.000Z",
  "checks": {
    "sqlite": "up"
  }
}
```

SQLite 不可用时返回 HTTP `503`，`status` 为 `degraded`。

## 脚本

| 命令                    | 说明                                             |
| ----------------------- | ------------------------------------------------ |
| `pnpm native:dev`       | 开发模式（tsx watch）                            |
| `pnpm native:build`     | `tsc` + esbuild 单文件 `dist/desktop-bundle.cjs` |
| `pnpm native:start`     | 运行 `tsc` 产物 `dist/index.js`                  |
| `pnpm native:typecheck` | TypeScript 检查                                  |

也可在包目录内使用 `pnpm --filter @openworker/native <script>`。包内另有 `bundle` 脚本仅跑 esbuild。

## 环境变量

参见 [`.env.example`](./.env.example)。

| 变量          | 默认                                 | 说明            |
| ------------- | ------------------------------------ | --------------- |
| `PORT`        | `3200`                               | HTTP 监听端口   |
| `SQLITE_PATH` | `~/.openworker/native/native.sqlite` | SQLite 文件路径 |
