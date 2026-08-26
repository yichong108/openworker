# ap-cli 系统架构

- **Deciders:** Wang Zhang

## Context

`apps/ap-cli`（包名 `@openworker/ap`，命令 `ap`）是 OpenWorker monorepo 中的 **AI 软件生产流水线 CLI**。它基于 Cursor SDK 在本地启动 Agent，读取并执行 `.agents/skills/` 下的 Skill，同时负责初始化 work-data 种子、创建任务与决策文件。与 `apps/ap-web` 共用 `.agents/ap-config/work-data/` 数据约定，是 AI-PIPELINE 的命令行端。

## Decision

### 技术栈

| 层级   | 选型                                               |
| ------ | -------------------------------------------------- |
| 运行时 | Node.js >= 22.13.0                                 |
| 语言   | TypeScript（ESM）                                  |
| Agent  | `@cursor/sdk`（`Agent.create` + 本地 `local.cwd`） |
| 构建   | `tsc` 产出 `dist/`，发布后通过 bin 入口 `ap` 运行  |
| 开发   | `tsx` 直接跑源码（`pnpm ap`）                      |

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│  CLI 入口 (src/index.ts)                                     │
│  loadApEnv → installApWorkspace → parseArgs → 分发子命令     │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────────────┐
│ 内建命令       │  │ Skill 执行     │  │ 工作区初始化           │
│ login/help    │  │ runApSkill    │  │ install-skills.ts     │
│ task-create   │  │ runApAsk      │  │ skills + work-data    │
│ decision-create│ │ (Cursor SDK)  │  │ 种子拷贝               │
└───────────────┘  └───────────────┘  └───────────────────────┘
        │                   │                   │
        └───────────────────┴───────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  本地文件系统 (.agents)                                      │
│  skills/  ap-config/work-data/tasks/  decisions/            │
└─────────────────────────────────────────────────────────────┘
```

### 目录结构

```
apps/ap-cli/
├── src/
│   ├── index.ts            # 入口：初始化 → 解析 → 分发
│   ├── cli.ts              # 子命令解析与帮助文案
│   ├── run.ts              # Cursor Agent 创建与流式输出
│   ├── prompt.ts           # ask / skill prompt 组装
│   ├── skills-fs.ts        # 发现 .agents/skills
│   ├── install-skills.ts   # skill + work-data 种子安装
│   ├── create-work-data.ts # task-create / decision-create
│   ├── env.ts              # 仓库根、环境变量、模型/模式
│   ├── skills/             # skill 源（安装到 .agents/skills）
│   │   ├── ap-task-execute/
│   │   └── ap-refactor/
│   └── work-data/          # work-data 种子（安装到 .agents/ap-config/work-data）
│       ├── tasks/
│       └── decisions/
├── dist/                   # 构建产物（npm publish）
└── package.json            # bin: ap → dist/index.js
```

### 子命令体系

| 类型  | 命令                          | 说明                                                      |
| ----- | ----------------------------- | --------------------------------------------------------- |
| 内建  | `ap login`                    | 浏览器登录 Cursor SDK，凭证写入 `~/.cursor/sdk/auth.json` |
| 内建  | `ap help [topic]`             | 顶层帮助或单个 skill 帮助                                 |
| 内建  | `ap task-create [--name]`     | 从模板创建任务到 `tasks/todo/`，不调用 Agent              |
| 内建  | `ap decision-create [--name]` | 从模板创建决策到 `decisions/`，不调用 Agent               |
| Skill | `ap <skill> [options]`        | 执行 `.agents/skills/<skill>/SKILL.md`                    |
| 提问  | `ap "<提问>" [--skill]`       | Agent 从已发现 skill 中选一个执行                         |

Skill 名规则：`ap-` 前缀可省略短名（如 `task-execute` ≡ `ap-task-execute`）。

选项：`--cwd`、`--model`、`--mode`（`agent` | `plan`）、`--task`、`--skill`。

### 工作区初始化

每次 `ap` 启动时调用 `installApWorkspace()`：

1. **Skills 安装** — 用 `apps/ap-cli/src/skills` 覆盖 `.agents/skills` 中的同名目录；不删除其他 skill
2. **Work-data 补齐** — 把 `apps/ap-cli/src/work-data` 拷到 `.agents/ap-config/work-data`；`*-template.md` 始终覆盖，其余同名文件跳过

`pnpm install` 时 `prepare` 脚本也会执行 skill 安装。

### Agent 执行流程

`run.ts` 中统一通过 `Agent.create` 创建本地 Cursor Agent：

- `local.cwd` 设为仓库根（`findWorkspaceRoot()`）
- `settingSources: ['project']` 加载项目规则
- prompt 内联 `SKILL.md` 全文，避免 filesystem skill 未挂载
- 流式输出 assistant 文本到 stdout，thinking/tool/status 到 stderr
- 支持 SIGINT 取消

两种执行模式：

1. `runApSkill` — 指定 skill，读取 SKILL.md 拼 prompt
2. `runApAsk` — 用户提问，列出所有 skill 摘要由 Agent 自选

### 鉴权

- 环境变量 `CURSOR_API_KEY`
- 或 `ap login` 写入 SDK 凭证
- `help` / `task-create` / `decision-create` 不需要 Key

### 与 work-data 的约定

任务目录结构（与 ap-web 一致）：

```
.agents/ap-config/work-data/
├── tasks/
│   ├── todo/       ← 待执行
│   ├── doing/      ← 进行中
│   ├── done/       ← 已完成（按年份分子目录）
│   ├── blocked/    ← 阻塞
│   └── plan/       ← 仅人工，AI 不读写
└── decisions/      ← 架构决策（AI 可读不可改）
```

核心 skill `ap-task-execute` 负责串行执行任务队列，约定见 `apps/ap-cli/src/skills/ap-task-execute/SKILL.md`。

### 与 monorepo 的关系

```
openworker (pnpm workspace)
├── apps/ap-cli          ← 本应用（CLI，@openworker/ap）
├── apps/ap-web          ← Web 看板，共用 .agents 约定
└── （ap-cli 不依赖 ap-agent / llm 包，直接用 Cursor SDK）
```

根目录脚本：

- `pnpm ap` — tsx 跑源码
- `pnpm ap:build` / `pnpm ap:start:dist` — 验证构建产物
- `pnpm ai-pipeline:task-execute` 等 — 快捷调用 dist skill

## 设计特点

1. **Skill 即插件**：行为由 `.agents/skills/*/SKILL.md` 定义，CLI 只负责发现、组装 prompt、启动 Agent
2. **文件即数据**：任务与决策均为 markdown，与 ap-web 共享目录约定
3. **种子 + 增量**：work-data 模板覆盖安装，用户数据不覆盖
4. **本地 Agent**：Cursor SDK 在本机 cwd 下改代码，流式输出到终端
5. **双模式**：`agent`（直接改代码）与 `plan`（先出方案）

## Consequences

- **正面：** 与 ap-web 任务格式完全兼容；skill 可独立演进；CLI 轻量，仅依赖 Cursor SDK
- **负面 / 风险：** ap-cli 仍依赖 Cursor SDK，而 ap-web 已迁移到 DeepSeek + ApAgentWithAGUI，两端 Agent 运行时不同
- **后续工作：** 可考虑 ap-cli 也支持 DeepSeek 路径，或统一 Agent 抽象层
