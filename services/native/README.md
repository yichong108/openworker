# @openworker/native

OpenWorker 本地 Native 服务（Node.js + Express + SQLite）。

面向桌面侧本地能力的轻量 HTTP 服务；当前提供健康检查与 SQLite 初始化骨架。

SQLite 使用 Node 内置 [`node:sqlite`](https://nodejs.org/api/sqlite.html)（`DatabaseSync`），无需编译原生插件；需要 Node.js ≥ 22.5。

## 快速开始

```bash
# 在仓库根目录安装依赖
pnpm install

# 启动开发服务
pnpm native:dev
```

默认监听 `http://127.0.0.1:3200`（仅绑定回环地址）。

## 与 Desktop 的关系

Desktop 主进程会在启动时自动拉起 Native（若端口上 `/health` 已 ok 则复用，不重复占用）：

- **开发**：用系统 Node 跑本包 `dist/desktop-bundle.cjs`（或 `dist/index.js` / tsx 源码）
- **安装包**：`extraResources` 携带 `desktop-bundle.cjs` → `resources/native/index.js`，以 `ELECTRON_RUN_AS_NODE=1` + Electron 可执行文件运行（无需用户安装 Node）

因此日常开发不必单独开 `pnpm native:dev`；若已手动启动，Desktop 会复用且退出时不杀外部进程。

## SQLite 路径

默认数据库文件：

```text
~/.openworker/native/native.sqlite
```

与 Desktop / CLI 的 `~/.openworker`（skills、mcp）同源。一般无需设置环境变量。

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
