# @openworker/ap-web

本地任务看板：读取并维护 `.agents/ap-config/work-data/tasks/` 下的 markdown 任务。

## 开发

在仓库根目录：

```bash
pnpm ap-web:dev
```

浏览器打开 http://localhost:3010 。

五列对应 `todo` / `doing` / `done` / `blocked`；工具集从 `.agents/skills` 添加 skill，通过 Cursor SDK 开始/停止执行。不读写 `plan/`。

执行 skill 需要 `CURSOR_API_KEY`（`apps/ap-web/.env`、仓库根 `.env` 或 `apps/ap-cli/.env`）。
