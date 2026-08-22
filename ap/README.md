# @openworker/ap

基于 Cursor SDK 的 AI 软件生产流水线命令。命令名：`ap`。

## 安装

```bash
npm i -g @openworker/ap
# 或
pnpm add -g @openworker/ap
```

安装后即可使用 `ap`：

```bash
ap help
ap login
ap task-create
ap task-create --name 用户登录
ap task-execute
ap decision-create
ap decision-create --name module-map
```

也可以不全局安装，直接：

```bash
npx @openworker/ap help
```

## 本地开发

本仓库已把 `@openworker/ap` 作为 workspace 包，**不要**在仓库根再安装一份。根目录 `pnpm install` 后，用 `pnpm ap` 直接跑源码（`tsx`，不经过 `dist`）：

```bash
pnpm ap help
pnpm ap login
pnpm ap task-create --name 用户登录
pnpm ap task-execute --mode plan
```

鉴权：复制 `ap/.env.example` 为 `ap/.env` 并填入 `CURSOR_API_KEY`，或运行 `pnpm ap login`。`help` / `task-create` / `decision-create` 不需要 Key。

## 验证构建

`pnpm ap` 测的是源码。发布后用户走的是 `dist/index.js`，本地应再跑一遍构建产物：

```bash
pnpm ap:build
pnpm ap:start:dist help
pnpm ap:start:dist task-create --name 构建冒烟
```

更接近发布包时，在 `ap/` 下执行 `pnpm pack`，检查生成的 tarball 是否包含 `dist/`、`src/skills`、`src/work-data`。

## 要求

- Node.js >= 22.13.0
- Cursor API Key（环境变量 `CURSOR_API_KEY`，或运行 `ap login`）
