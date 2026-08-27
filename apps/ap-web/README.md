# @openworker/ap-web

本地任务看板：读取并维护 `.agents/ap-config/work-data/tasks/` 下的 markdown 任务。

## 开发

在仓库根目录：

```bash
pnpm ap-web:dev
```

浏览器打开 http://localhost:3011 。

五列对应 `todo` / `doing` / `done` / `blocked`；工具集从 `.agents/ap-config/skills` 与 `.agents/skills` 添加 skill，通过 DeepSeek + `@openworker/ap-agent` 开始/停止执行。不读写 `plan/`。

`.agents` 目录对齐**敲命令时的工作目录**（pnpm 的 `INIT_CWD`；未设置时用 `process.cwd()`），任务与 toolbox 共用这一棵树，不会从包目录向上查找。因此在仓库根执行 `pnpm ap-web:dev` 时读写仓库根 `.agents/`；在 `apps/ap-web` 内执行 `pnpm dev` 时读写 `apps/ap-web/.agents/`。

已添加工具写在该 `.agents/ap-config/web-data/toolbox.json`。任务 markdown 在 `.agents/ap-config/work-data/tasks/`。后端监听 `.agents`，四列任务文件变化时通过 SSE `/api/tasks/stream` 推送给看板。

执行 skill / 任务 Agent 需要 DeepSeek API Key：在配置抽屉填写，或设置 `DEEPSEEK_API_KEY`（`apps/ap-web/.env`、仓库根 `.env` 或 `apps/ap-cli/.env`）。`pnpm dev` 前会通过 turbo 自动 build 上游 workspace 包。

## 发布（npm 依赖，不带 standalone/node_modules）

源码 `package.json` 保持 `private: true` 与 `workspace:*`，不能从 `apps/ap-web` 直接 publish。

```bash
pnpm ap-web:build
pnpm --filter @openworker/ap-web prepare-publish
```

脚本会写入 `apps/ap-web/.publish-staging/`（gitignore）：

- 发布用 `package.json`（`next` / `react` 等为真实版本号，无 `workspace:*`）
- `bin/ap-web.mjs`
- `standalone-dist/`：`.next/standalone` **不含任何 `node_modules`**
- **不会**在这里执行 `npm install`（完整 `next`+`antd` 可达数百 MB，且本来就不会打进 tarball）

`files` 只有 `bin` 和 `standalone-dist`，发布包里没有 `node_modules`。用户 `npm i @openworker/ap-web` 时才会在自己机器上装依赖。

本仓库内看板：`pnpm ap-web:build` 后 `pnpm ap view`（走 workspace 包的 `.next/standalone`，不经过 `.publish-staging`）。

本机若要验证**发布目录**能否启动（会占本地磁盘，可装完删）：

```bash
cd apps/ap-web/.publish-staging
npm install --omit=dev
node bin/ap-web.mjs
```

发布：

```bash
pnpm release:ap-web
# 或在 .publish-staging 内：npm publish --access public
```

探活：`GET /api/health` 返回 `{ ok, launchDir }`，供 `ap view` 识别多实例。
