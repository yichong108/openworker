# @openworker/ap

用 Cursor SDK 本地 Agent 执行项目 `.agents/skills` 中的任意技能。命令名：`ap`。

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
ap decision-create
ap decision-create --name module-map
ap "帮我执行下一个任务"
```

也可以不全局安装，直接：

```bash
npx @openworker/ap help
```

## 要求

- Node.js >= 22.13.0
- Cursor API Key（环境变量 `CURSOR_API_KEY`，或运行 `ap login`）
