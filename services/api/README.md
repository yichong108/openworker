# @openworker/api

OpenWorker 后端 API 服务（Node.js + Express + MySQL + Redis）。

## 快速开始

```bash
# 在仓库根目录安装依赖
pnpm install

# 复制环境变量
cp services/api/.env.example services/api/.env

# 启动本地 MySQL + Redis（独立于 langfuse-local）
pnpm --filter @openworker/api docker:up

# 启动开发服务
pnpm api:dev
```

默认监听 `http://127.0.0.1:3100`。

## 本地依赖（Docker）

`docker-compose.yml` 仅编排 API 所需的 MySQL 与 Redis，容器名为 `openworker-mysql` / `openworker-redis`，与 `services/langfuse-local` 互不共用。

| 服务      | 默认端口 | 默认凭证                             |
| --------- | -------- | ------------------------------------ |
| MySQL 8.4 | `3306`   | root / `password`，库名 `openworker` |
| Redis 7   | `6379`   | 无密码（可用 `REDIS_PASSWORD` 开启） |

端口与凭证读取本目录 `.env`（与 `.env.example` 对齐）。若与本机其它服务冲突，修改 `.env` 中的 `MYSQL_PORT` / `REDIS_PORT` 后重新 `docker:up`。

## 健康检查

```bash
curl http://127.0.0.1:3100/health
```

成功示例：

```json
{
  "status": "ok",
  "timestamp": "2026-07-22T02:00:00.000Z",
  "checks": {
    "mysql": "up",
    "redis": "up"
  }
}
```

当 MySQL 或 Redis 不可用时返回 HTTP `503`，`status` 为 `degraded`。

## Auth API

账号密码登录（暂无注册）。启动时 `ensureSchema()` 会创建 `users` 表，并在不存在时种子写入默认管理员：

| 字段     | 值      |
| -------- | ------- |
| username | `admin` |
| password | `admin` |
| role     | `admin` |

密码以 bcrypt 哈希存储。JWT 相关配置见 `JWT_SECRET` / `JWT_EXPIRES_IN`。

### `POST /auth/login`

请求体：

```json
{ "username": "admin", "password": "admin" }
```

成功（200，`code === 0`）：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "accessToken": "<jwt>",
    "user": { "id": "...", "username": "admin", "role": "admin" }
  }
}
```

失败（仍为 HTTP 200，`code !== 0`）：

```json
{ "code": 40101, "message": "Invalid username or password", "data": null }
```

### `GET /auth/me`

请求头：`Authorization: Bearer <accessToken>`

成功返回：

```json
{
  "code": 0,
  "message": "ok",
  "data": { "user": { "id": "...", "username": "admin", "role": "admin" } }
}
```

## Users API

### `GET /users`

返回全部用户公开信息（不含密码）。当前暂无鉴权，供后台管理使用。

成功（200，`code === 0`）：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "users": [
      {
        "id": "...",
        "username": "admin",
        "role": "admin",
        "createdAt": "2026-08-04T03:00:00.000Z"
      }
    ]
  }
}
```

## Settings API

全局应用配置（与桌面端 `@openworker/shared` 的 `AppSettings` 同构）。当前 settings 路由仍无鉴权，读写同一条 `default` 记录，落库于 MySQL `app_settings`，并用 Redis 短缓存。

### `GET /settings`

返回：

```json
{ "data": { "provider": "deepseek", "providerProfiles": { "...": "..." }, "...": "..." } }
```

### `PUT /settings`

请求体为 `Partial<AppSettings>`（JSON 对象），服务端与现有记录合并后规范化并保存。

```bash
curl -X PUT http://127.0.0.1:3100/settings \
  -H "Content-Type: application/json" \
  -d '{"tavilyApiKey":"tvly-xxx"}'
```

## User Profile API

按登录用户隔离的跨会话用户画像（`user_profiles.facts_json`）。**需要** `Authorization: Bearer <accessToken>`。

| 方法 | 路径          | 说明                                          |
| ---- | ------------- | --------------------------------------------- |
| GET  | `/me/profile` | 返回 `{ facts, updatedAt }`；无记录则空 facts |
| PUT  | `/me/profile` | 整包覆盖；body: `{ facts: UserFactDto[] }`    |

```bash
TOKEN=... # 来自 /auth/login
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3100/me/profile
curl -X PUT http://127.0.0.1:3100/me/profile \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"facts":[{"key":"preference.packageManager","value":"pnpm","confidence":0.9,"updatedAt":1710000000000,"source":"llm"}]}'
```

## Workspaces / Sessions API

按登录用户隔离；**全部需要** `Authorization: Bearer <accessToken>`。响应统一为 `{ code, message, data }`（与 Auth 一致）。删除为**逻辑删除**（`deleted_at`），列表默认不可见。

表：`workspaces`、`sessions`（`messages_json` 存完整 AG-UI `Message[]` 整包；无独立 messages 表）、`user_profiles`。

| 方法   | 路径                                | 说明                                                       |
| ------ | ----------------------------------- | ---------------------------------------------------------- |
| GET    | `/workspaces`                       | 未删除工作区列表（空则自动确保 Home）                      |
| POST   | `/workspaces`                       | 创建；body: `{ id?, name, path?, isDefault?, sortOrder? }` |
| PATCH  | `/workspaces/:id`                   | 更新 name/path/isDefault                                   |
| DELETE | `/workspaces/:id`                   | 软删，并级联软删其下 sessions                              |
| PUT    | `/workspaces/reorder`               | body: `{ orderedIds: string[] }`                           |
| GET    | `/workspaces/:workspaceId/sessions` | 会话元数据列表（不含 messages）                            |
| POST   | `/workspaces/:workspaceId/sessions` | 创建会话；body: `{ id?, name? }`                           |
| PATCH  | `/sessions/:id`                     | 重命名 / `{ touch: true }`                                 |
| DELETE | `/sessions/:id`                     | 软删会话                                                   |
| GET    | `/sessions/:id/messages`            | `{ messages: Message[] }`                                  |
| PUT    | `/sessions/:id/messages`            | 整包覆盖 `messages_json`                                   |

示例：

```bash
TOKEN=... # 来自 /auth/login
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3100/workspaces
curl -X PUT http://127.0.0.1:3100/sessions/<id>/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"id":"u1","role":"user","content":"hi"}]}'
```

## Knowledge / RAG API（暂无鉴权）

环境变量：

| 变量                                     | 默认                     | 说明                                        |
| ---------------------------------------- | ------------------------ | ------------------------------------------- |
| `RAG_DATA_DIR`                           | `./data/rag`             | 原文与索引根目录                            |
| `RAG_EMBEDDING_PROVIDER`                 | `none`                   | `none`=关键词；`ollama`=LlamaIndex + Ollama |
| `RAG_OLLAMA_BASE_URL`                    | `http://127.0.0.1:11434` | Ollama 地址                                 |
| `RAG_OLLAMA_EMBED_MODEL`                 | `nomic-embed-text`       | embedding 模型                              |
| `RAG_LLM_API_KEY` / `BASE_URL` / `MODEL` | —                        | 可选 `withAnswer` Chat                      |

本地一键准备 Ollama（安装、拉模、写入本服务 `.env`）：

```bash
pnpm rag:setup-ollama
```

| Method           | Path                                      | 说明                                                          |
| ---------------- | ----------------------------------------- | ------------------------------------------------------------- |
| GET/POST         | `/knowledge-bases`                        | 列表 / 创建知识库                                             |
| GET/PATCH/DELETE | `/knowledge-bases/:id`                    | 详情 / 更新 / 软删                                            |
| GET/POST         | `/knowledge-bases/:id/documents`          | 文档列表 / multipart 上传（字段 `file`，`.txt`/`.md`）        |
| DELETE           | `/knowledge-bases/:kbId/documents/:docId` | 删除文档                                                      |
| POST             | `/rag/query`                              | 检索；body: `{ query, knowledgeBaseId?, topK?, withAnswer? }` |

`knowledgeBaseId` 省略时在全部知识库中检索并按 score 合并 top-k。`provider=ollama` 时为语义检索；Ollama 不可用时 query 回退关键词。

## 脚本

| 命令                                         | 说明                             |
| -------------------------------------------- | -------------------------------- |
| `pnpm rag:setup-ollama`                      | 安装 Ollama 并配置 RAG embedding |
| `pnpm --filter @openworker/api dev`          | 开发模式（tsx watch）            |
| `pnpm --filter @openworker/api build`        | 编译到 `dist/`                   |
| `pnpm --filter @openworker/api start`        | 运行编译产物                     |
| `pnpm --filter @openworker/api typecheck`    | TypeScript 类型检查              |
| `pnpm --filter @openworker/api docker:up`    | 启动 MySQL + Redis               |
| `pnpm --filter @openworker/api docker:down`  | 停止并移除容器                   |
| `pnpm --filter @openworker/api docker:logs`  | 跟踪容器日志                     |
| `pnpm --filter @openworker/api docker:reset` | 停止并删除数据卷                 |
