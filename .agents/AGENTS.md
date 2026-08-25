# Agent 说明

本文件用于指导在本仓库中工作的 AI 助手与贡献者。

## 基本原则

### 包管理器

- **仅允许使用 pnpm。** 本项目禁止使用 npm。所有依赖管理操作（安装、更新、添加依赖）必须使用 pnpm。
- **共享依赖版本使用 pnpm catalog。** 版本定义在根目录 `pnpm-workspace.yaml` 的 `catalog`；各包在 `package.json` 中写 `"catalog:"` 引用。修改共享版本时只改 catalog，勿在子包写死版本号。
- `shamefully-hoist=false`**。** 禁止依赖幽灵提升；各包必须在自己的 `package.json` 中声明所用依赖。

### 语言与提交

- **遵循 Conventional Commits 格式：** `<type>(<scope>): <description>`
  - **类型（Types）：** `feat`、`fix`、`docs`、`style`、`refactor`、`perf`、`test`、`chore`、`merge`、`improvement`
  - **范围（Scope）：** 可选，描述模块/页面（例如 `feat(auth):`、`fix(payment):`）
  - **描述（Description）：** 祈使语气，最多 50 个字符，不加句号
  - **示例：**
    - `feat(auth): add OAuth2 support`
    - `fix(api): resolve rate limit bypass`
    - `perf(dashboard): lazy load chart data`
    - `docs: update API documentation`
  - **破坏性变更：** 在 `:` 前加 `!`，或在 footer 中写 `BREAKING CHANGE:`

### 代码变更

- 在可行时，打开 PR 前运行项目定义的检查（例如 `pnpm typecheck`、`pnpm lint`）。
- 需要 lint:fix 并修复

### 注释规范

- **必须为所有导出函数添加注释**，描述函数的用途、意图和实现原因

### ap 数据工作区

- AI 需要根据 `.agents/ap-config/work-data` 目录下的约定进行处理。`ap/src/work-data` 是种子：`pnpm install` / `pnpm ap` 启动时拷贝到 `.agents/ap-config/work-data`，`*-template.md` 会覆盖，其余已存在的同名文件不覆盖。技能从 `ap/src/skills` 覆盖安装到 `.agents/skills/<skill>`，不删除 `.agents` 或其他 skill。`pnpm ap <skill>` 执行指定 skill（`ap-` 开头的也可用短名，如 `task-execute`）；`pnpm ap "<提问>"` 由 Agent 从 `.agents/skills` 中选一个执行，也可用 `--skill` 钉死 skill。`--mode` 为 Cursor SDK 对话模式（`agent` 默认 / `plan`）。
