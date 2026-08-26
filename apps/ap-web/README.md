# @openworker/ap-web

本地任务看板：读取并维护 `.agents/ap-config/work-data/tasks/` 下的 markdown 任务。

## 开发

在仓库根目录：

```bash
pnpm ap-web:dev
```

浏览器打开 http://localhost:3011 。

五列对应 `todo` / `doing` / `done` / `blocked`；工具集从 `.agents/skills` 添加 skill，通过 DeepSeek + `@openworker/ap-agent` 开始/停止执行。不读写 `plan/`。

`.agents` 目录对齐**敲命令时的工作目录**（pnpm 的 `INIT_CWD`；未设置时用 `process.cwd()`），任务与 toolbox 共用这一棵树，不会从包目录向上查找。因此在仓库根执行 `pnpm ap-web:dev` 时读写仓库根 `.agents/`；在 `apps/ap-web` 内执行 `pnpm dev` 时读写 `apps/ap-web/.agents/`。

已添加工具写在该 `.agents/ap-config/web-data/toolbox.json`。任务 markdown 在 `.agents/ap-config/work-data/tasks/`。后端监听 `.agents`，四列任务文件变化时通过 SSE `/api/tasks/stream` 推送给看板。

执行 skill / 任务 Agent 需要 DeepSeek API Key：在配置抽屉填写，或设置 `DEEPSEEK_API_KEY`（`apps/ap-web/.env`、仓库根 `.env` 或 `apps/ap-cli/.env`）。`pnpm dev` 前会通过 turbo 自动 build 上游 workspace 包。

## 发布（standalone）

`next build` 产出 standalone，由 `scripts/prepare-standalone.mjs` 组装 `.publish-staging/`（含 `bin/ap-web.mjs` 与临时 `package.json`），再 `npm publish`：

```bash
pnpm release:ap-web
```

发布后用户通过 `ap view` 启动（默认端口 10000–10099，由 `INIT_CWD` 对齐项目 `.agents/`）。开发仍用 `pnpm ap-web:dev`（:3011）。

探活：`GET /api/health` 返回 `{ ok, launchDir }`，供 `ap view` 识别多实例。
