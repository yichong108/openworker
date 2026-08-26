# AI-PIPELINE（ap-cli, ap-web）系统架构

- **Deciders:** Wang Zhang

## Context

AI-PIPELINE 是 OpenWorker 中面向本地 AI 软件生产的工具链，由 CLI（`apps/ap-cli`）与 Web 看板（`apps/ap-web`）组成。两者共用 `.agents/` 目录下的 Skill、任务 markdown 与决策文档，形成「命令行执行 + 可视化看板」的双端协作。

## Decision

### 系统定位

| 端  | 包名                 | 入口                      | 职责                                                |
| --- | -------------------- | ------------------------- | --------------------------------------------------- |
| CLI | `@openworker/ap`     | `ap` / `pnpm ap`          | Skill 执行、任务/决策创建、work-data 种子安装       |
| Web | `@openworker/ap-web` | `pnpm ap-web:dev` → :3011 | 任务看板、拖拽改状态、任务 Agent 对话、Skill 工具集 |

### 共享数据层（`.agents/`）

```
.agents/
├── skills/                              ← Skill 插件（SKILL.md）
│   ├── ap-task-execute/
│   └── ap-refactor/
└── ap-config/
    ├── work-data/
    │   ├── tasks/                       ← 任务 markdown（todo/doing/done/blocked）
    │   └── decisions/                   ← 架构决策
    ├── web-data/
    │   ├── toolbox.json                 ← ap-web 工具集配置
    │   └── chat/                        ← ap-web 任务对话历史
    └── ai-config.local.json             ← ap-web DeepSeek 配置
```

**核心约定：**

- 任务状态以**所在目录**为准（`todo` / `doing` / `done` / `blocked`）
- `plan/` 仅供人工，AI 不读写
- 决策文档 AI 可读不可改
- work-data 种子来自 `apps/ap-cli/src/work-data`，由 `ap` 启动时补齐

### 双端协作关系

```
                    ┌─────────────────┐
                    │   .agents/      │
                    │  (文件即数据)    │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │  ap-cli    │  │  ap-web    │  │  Cursor /  │
     │  终端执行   │  │  看板管理   │  │  DeepSeek  │
     └────────────┘  └────────────┘  └────────────┘
```

- **ap-cli**：在终端跑 Skill（如 `ap task-execute`），适合连续自动化流水线
- **ap-web**：可视化任务列、编辑字段、移入 `doing` 时自动启动任务 Agent，适合日常任务管理与对话
- 两端读写同一套任务 markdown，可交替使用

### Agent 运行时差异

|          | ap-cli                        | ap-web                                    |
| -------- | ----------------------------- | ----------------------------------------- |
| SDK      | `@cursor/sdk`                 | `@openworker/ap-agent`（ApAgentWithAGUI） |
| 模型     | Cursor（composer 等）         | DeepSeek                                  |
| 鉴权     | `CURSOR_API_KEY` / `ap login` | `DEEPSEEK_API_KEY` / 配置抽屉             |
| 输出     | 终端 stdout/stderr            | Web UI + SSE 推送                         |
| 执行方式 | 进程退出即结束                | 后台 Job + 内存 Map                       |

> ap-web 已从 Cursor SDK 迁移至 DeepSeek（见任务 `task-20260826145900`）。ap-cli 仍使用 Cursor SDK。

### 详细架构文档

- [ap-cli 系统架构](./ap-cli-overview.md) — CLI 子命令、Skill 安装、Cursor Agent 执行
- [ap-web 系统架构](./ap-web-overview.md) — Next.js 看板、文件监听 SSE、DeepSeek Agent

### 典型工作流

1. `ap task-create --name 实现某某功能` → 在 `todo/` 创建任务
2. `pnpm ap-web:dev` → 浏览器查看看板、编辑优先级与需求
3. 拖入 `doing` → ap-web 自动启动任务 Agent（DeepSeek）
4. 或 `ap task-execute` → ap-cli 串行执行 TODO 队列（Cursor SDK）
5. 完成后任务在 `done/`，两端均可看到

## Consequences

- **正面：** 双端互补，CLI 适合自动化流水线，Web 适合可视化管理；共享 markdown 便于 git 追踪
- **负面 / 风险：** 两端 Agent 运行时不同，行为可能不完全一致；ap-web 的 `INIT_CWD` 与仓库根路径语义需留意
- **后续工作：** 统一 Agent 抽象或让 ap-cli 也支持 DeepSeek 路径
