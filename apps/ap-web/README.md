# @openworker/ap-web

本地任务看板：读取并维护 `.agents/ap-config/work-data/tasks/` 下的 markdown 任务。

## 开发

在仓库根目录：

```bash
pnpm ap-web:dev
```

浏览器打开 http://localhost:3010 。

五列对应 `todo` / `doing` / `done` / `blocked`；工具集列暂为占位。不读写 `plan/`。
