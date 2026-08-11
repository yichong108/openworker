# @openworker/native

OpenWorker 本地 Native 服务（Node.js + Express + SQLite）。

为 Desktop 提供与 `@openworker/api` **契约对齐**的本地数据面 HTTP API（鉴权、设置、工作区/会话、用户画像）。存储为 SQLite，**无 MySQL / Redis / RAG**。

SQLite 使用 Node 内置 [`node:sqlite`](https://nodejs.org/api/sqlite.html)（`DatabaseSync`），无需编译原生插件；需要 Node.js ≥ 22.5。

## 快速开始

```bash
# 在仓库根目录安装依赖
pnpm install

# 启动开发服务
pnpm native:dev
```

默认监听 `http://127.0.0.1:3200`（仅绑定回环地址）。默认管理员：`admin` / `admin`。

## 与 Desktop 的关系

Desktop 主进程会在启动时自动拉起 Native（若端口上 `/health` 已 ok 则复用，不重复占用）：

- **开发**：用系统 Node 跑本包 `dist/desktop-bundle.cjs`（或 `dist/index.js` / tsx 源码）
- **安装包**：`extraResources` 携带 `desktop-bundle.cjs` → `resources/native/index.js`，以 `ELECTRON_RUN_AS_NODE=1` + Electron 可执行文件运行（无需用户安装 Node）

Desktop **非 RAG** 请求（auth / settings / workspaces / sessions / profile）默认打本服务；**RAG**（`POST /rag/query`）仍走 `@openworker/api`。

因此日常开发不必单独开 `pnpm native:dev`；若已手动启动，Desktop 会复用且退出时不杀外部进程。

## 与 api 的差异

| 项                  | api (`:3100`)            | native (`:3200`)           |
| ------------------- | ------------------------ | -------------------------- |
| 数据库              | MySQL                    | SQLite                     |
| 缓存                | Redis（settings 短缓存） | 无                         |
| RAG / 知识库        | 有                       | **未实现**（请继续用 api） |
| 路径与 JWT envelope | 对齐                     | 对齐                       |

## HTTP 端点

| Method           | Path                                | Auth   | 说明                |
| ---------------- | ----------------------------------- | ------ | ------------------- |
| `GET`            | `/health`                           | 无     | SQLite 探活         |
| `POST`           | `/auth/login`                       | 无     | 账号密码 → JWT      |
| `GET`            | `/auth/me`                          | Bearer | 恢复会话用户        |
| `GET`            | `/users`                            | 无     | 用户列表            |
| `GET`/`PUT`      | `/settings`                         | 无     | 全局 AppSettings    |
| `GET`/`PUT`      | `/me/profile`                       | JWT    | 用户画像            |
| `GET`/`POST`     | `/workspaces`                       | JWT    | 工作区列表/创建     |
| `PUT`            | `/workspaces/reorder`               | JWT    | 重排                |
| `PATCH`/`DELETE` | `/workspaces/:id`                   | JWT    | 更新/软删           |
| `GET`/`POST`     | `/workspaces/:workspaceId/sessions` | JWT    | 会话列表/创建       |
| `PATCH`/`DELETE` | `/sessions/:id`                     | JWT    | 重命名·touch / 软删 |
| `GET`/`PUT`      | `/sessions/:id/messages`            | JWT    | 消息整包读写        |

响应格式与 api 一致：多数 `{ code, message, data }`；settings 为 `{ data }`；health 为 `{ status, timestamp, checks }`。

## SQLite 路径与表

默认数据库文件：

```text
~/.openworker/native/native.sqlite
```

业务表：`users`、`app_settings`、`workspaces`、`sessions`、`user_profiles`（另有 `_meta` 骨架标记）。不含知识库表。

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

| 变量             | 默认                                 | 说明                |
| ---------------- | ------------------------------------ | ------------------- |
| `PORT`           | `3200`                               | HTTP 监听端口       |
| `SQLITE_PATH`    | `~/.openworker/native/native.sqlite` | SQLite 文件路径     |
| `JWT_SECRET`     | 开发占位密钥                         | JWT 签名密钥        |
| `JWT_EXPIRES_IN` | `7d`                                 | access token 有效期 |
