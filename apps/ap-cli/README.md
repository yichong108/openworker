# @openworker/ap

基于 Cursor SDK 的 AI 软件生产流水线命令。命令名：`ap`。

## 安装

```bash
npm i -g @openworker/ap
# 或
pnpm add -g @openworker/ap
```

安装后先在项目根初始化，再使用 `ap`：

```bash
ap init
ap help
ap login
ap task-create
ap task-create --name 用户登录
ap task-execute
ap decision-create
ap decision-create --name module-map
ap view
```

`ap view` 启动已发布的 `@openworker/ap-web` standalone 看板（端口自动分配 10000–10099，多项目可并行）。本地 monorepo 开发看板请用 `pnpm ap-web:dev`。

也可以不全局安装，直接：

```bash
npx @openworker/ap help
```

## 本地开发

本仓库已把 `@openworker/ap` 作为 workspace 包，**不要**在仓库根再安装一份。根目录 `pnpm install` 后，用 `pnpm ap` 直接跑源码（`tsx`，不经过 `dist`）：

```bash
pnpm ap init
pnpm ap help
pnpm ap login
pnpm ap task-create --name 用户登录
pnpm ap task-execute --mode plan
```

鉴权：复制 `apps/ap-cli/.env.example` 为 `apps/ap-cli/.env` 并填入 `CURSOR_API_KEY`，或运行 `pnpm ap login`。`init` / `help` / `task-create` / `decision-create` / `view` 不需要 Key。

### ap view（发布后）

全局安装 `@openworker/ap` 后，在项目根执行：

```bash
ap view
ap view --no-open
ap view --port 10050
```

- 通过 `npx --ignore-existing` 启动 `@openworker/ap-web`（按本 CLI 的 `major.minor` 取 `@x.y.x` 当前最新 patch）
- 多项目并行时各目录独立端口，记录在 `.agents/ap-config/web-data/ap-web.port`
- 环境变量：`AP_WEB_PORT_MIN`（默认 10000）、`AP_WEB_PORT_MAX`（默认 10099）

本仓库内开发看板请用 `pnpm ap-web:dev`。`pnpm ap view` 与发布后一样走 npx 拉已发布包。

## 验证构建

`pnpm ap` 测的是源码。发布后用户走的是 `dist/index.js`，本地应再跑一遍构建产物：

```bash
pnpm ap:build
pnpm ap:start:dist help
pnpm ap:start:dist task-create --name 构建冒烟
```

更接近发布包时，在 `apps/ap-cli/` 下执行 `pnpm pack`，检查生成的 tarball 是否包含 `dist/`、`src/skills`、`src/work-data`。

## 要求

- Node.js >= 22.13.0
- Cursor API Key（环境变量 `CURSOR_API_KEY`，或运行 `ap login`）
