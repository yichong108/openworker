# ap-web 系统架构

- **Deciders:** Wang Zhang

## Context

`apps/ap-web` 是 OpenWorker monorepo 中的**本地任务看板 Web 应用**，负责可视化和管理 `.agents/ap-config/work-data/tasks/` 下的 markdown 任务，并通过 DeepSeek + `@openworker/ap-agent` 驱动任务 Agent 与 Skill 执行。它与 `apps/ap-cli` 共用同一套 `.agents` 数据约定，是 AI-PIPELINE 的 Web 端。

## Decision

### 技术栈

| 层级    | 选型                                                                |
| ------- | ------------------------------------------------------------------- |
| 框架    | Next.js 14（App Router）+ React 18                                  |
| 语言    | TypeScript                                                          |
| 样式    | Tailwind CSS + 自定义 CSS 变量（夜间工作室主题）                    |
| UI 组件 | Ant Design 5，封装为 `src/components/antd/Ap*`                      |
| Agent   | `@openworker/ap-agent`（`ApAgentWithAGUI`）+ `@ag-ui/client` + RxJS |
| LLM     | DeepSeek（`@openworker/llm`）                                       |
| 运行时  | API Route 强制 `runtime = 'nodejs'`，直接读写本地文件系统           |

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│  前端 (Client Components)                                    │
│  page.tsx → TaskBoard → TaskColumn×4 | ToolsColumn | Chat   │
└───────────────────────────┬─────────────────────────────────┘
                            │ fetch / EventSource (SSE)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Next.js API Routes                                          │
│  /api/tasks  /api/tasks/stream  /api/tasks/chat/*           │
│  /api/skills/*  /api/toolbox  /api/config/ai                │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  src/lib 业务层                                              │
│  task-fs / task-watch / task-agent-runner / skill-runner    │
│  ap-agent-runtime / ai-config                               │
└───────────────┬─────────────────────────────┬───────────────┘
                │                             │
                ▼                             ▼
┌───────────────────────────┐   ┌─────────────────────────────┐
│  本地文件系统 (.agents)    │   │  Agent 层                    │
│  tasks/ toolbox.json chat/ │   │  ApAgentWithAGUI → DeepSeek │
│  skills/ ai-config.local   │   └─────────────────────────────┘
└───────────────────────────┘
```

### 目录结构

```
apps/ap-web/
├── src/app/                    # Next.js App Router
│   ├── page.tsx                # 首页 → 渲染 TaskBoard
│   ├── layout.tsx              # 根布局、字体
│   ├── globals.css
│   └── api/                    # Route Handler
│       ├── tasks/              # 任务 CRUD + SSE + 对话
│       ├── skills/             # Skill 列表/运行/停止
│       ├── toolbox/            # 工具集持久化
│       └── config/ai/          # DeepSeek 配置
├── src/components/
│   ├── TaskBoard.tsx           # 看板主控（状态 + SSE 订阅）
│   ├── TaskColumn.tsx / TaskCard.tsx
│   ├── ToolsColumn.tsx         # 第 5 列：Skill 工具集
│   ├── chat/                   # AiChatDialog、消息列表
│   ├── antd/                   # Ant Design 主题封装
│   └── ConfigDialog.tsx
└── src/lib/                    # 核心业务逻辑
    ├── task-fs.ts              # markdown 读写、移动、创建
    ├── task-watch.ts           # 文件监听 → SSE 推送
    ├── task-agent-runner.ts    # 任务 Agent 会话管理
    ├── skill-runner.ts         # Skill 后台执行
    ├── ap-agent-runtime.ts     # 创建 ApAgentWithAGUI 实例
    ├── ai-config.ts            # DeepSeek 配置读写
    ├── ap-web-agents-root.ts   # .agents 路径解析
    └── workspace-root.ts       # 仓库根路径解析
```

### 数据模型：文件系统即数据源

任务不以数据库存储，**目录结构即状态**：

- `todo/`、`doing/`、`done/`、`blocked/` 四列对应子目录
- 任务的 `status` 以**所在目录**为准，而非 markdown 内 `Status` 字段
- `done/` 下按年份分子目录（如 `done/2026/`）
- **`plan/` 目录被显式禁止访问**（API 与 FS 层均有校验）

主要数据路径：

| 数据          | 路径                                                              |
| ------------- | ----------------------------------------------------------------- |
| 任务 markdown | `{INIT_CWD}/.agents/ap-config/work-data/tasks/`                   |
| 工具集配置    | `{INIT_CWD}/.agents/ap-config/web-data/toolbox.json`              |
| 任务对话历史  | `{INIT_CWD}/.agents/ap-config/web-data/chat/{fileName}-chat.json` |
| AI 配置       | `{仓库根}/.agents/ap-config/ai-config.local.json`                 |
| Skill 目录    | `{仓库根}/.agents/skills/`                                        |

#### 两套路径解析策略

1. **`getApWebAgentsRoot()`** — 基于 `INIT_CWD`（用户敲 `pnpm ap-web:dev` 时的目录），用于任务、toolbox、文件监听
2. **`getWorkspaceRoot()`** — 向上查找含 `pnpm-workspace.yaml` 或 `.agents/skills` 的目录，用于 Agent 的 `cwd`、Skill 列表、AI 配置

因此在**仓库根**执行 `pnpm ap-web:dev` 时读写仓库根 `.agents/`；在 `apps/ap-web` 内执行 `pnpm dev` 时则读写 `apps/ap-web/.agents/`。

### 前端：五列看板

首页只渲染 `TaskBoard`（`src/app/page.tsx`）。

`TaskBoard` 是核心 Client Component，职责包括：

- 首屏 `GET /api/tasks` 拉取四列任务摘要
- 订阅 `EventSource('/api/tasks/stream')` 实时同步看板
- 订阅 `EventSource('/api/tasks/chat/stream')` 同步各任务对话
- 卡片展开时 `GET /api/tasks/{id}` 拉详情
- 拖拽/按钮 `PATCH /api/tasks/{id}` 改状态或编辑字段
- 打开 `AiChatDialog` 与任务 Agent 对话

UI 布局为 **5 列 grid**：`todo | doing | done | blocked | 工具集`。

### 后端 API 层

所有 Route 均为 Node.js 运行时、强制动态（`runtime = 'nodejs'`，`dynamic = 'force-dynamic'`）。

| 端点                            | 作用                       |
| ------------------------------- | -------------------------- |
| `GET/POST /api/tasks`           | 列出四列 / 创建任务        |
| `GET/PATCH /api/tasks/[...id]`  | 读详情 / 更新字段 / 移动列 |
| `GET /api/tasks/stream`         | SSE 推送看板快照           |
| `GET/POST /api/tasks/chat/send` | 读/发任务对话              |
| `POST /api/tasks/chat/stop`     | 停止 Agent                 |
| `GET /api/tasks/chat/stream`    | SSE 推送对话 transcript    |
| `GET /api/skills`               | 列出 `.agents/skills`      |
| `POST /api/skills/run`          | 启动 Skill 执行            |
| `POST /api/skills/stop`         | 停止 Skill                 |
| `GET /api/skills/runs`          | 运行状态快照               |
| `GET/PATCH /api/toolbox`        | 工具集 CRUD                |
| `GET/PUT /api/config/ai`        | DeepSeek 配置              |

### 实时同步机制

`task-watch.ts` 用 `fs.watch` 监听 `.agents` 目录（递归），150ms 防抖后重读看板；若 JSON 快照未变则不推送（避免 toolbox/skills 变更空刷）。

SSE 连接时先推当前快照，之后有变更再推；每 15 秒发 heartbeat 保活。监听 hub 挂在 `globalThis` 上，避免 Next.js 热重载重复注册 watcher。

### Agent 执行架构

已从 **Cursor SDK** 迁移到 **ApAgentWithAGUI + DeepSeek**（`src/lib/ap-agent-runtime.ts`）。

两条 Agent 执行路径：

#### 1. 任务 Agent（`task-agent-runner.ts`）

- 任务移入 `doing` 时，`PATCH` 路由自动调用 `startTaskAgent()`，用任务 Requirements/Context/Constraints 拼 prompt 启动
- 移出 `doing` 时调用 `stopTaskAgent()`
- 内存维护 `jobs` Map（fileName → Agent + RxJS subscription）和 `transcripts` Map
- AG-UI 事件流（文本增量、工具调用等）转为 `ChatTranscript`，经 SSE 推给前端
- 对话历史落盘到 `web-data/chat/`

#### 2. Skill 执行（`skill-runner.ts`）

- `ToolsColumn` 从 `.agents/skills` 选 Skill 加入 toolbox
- 支持手动运行、定时调度（客户端轮询 `/api/skills/runs`）
- 读取 `SKILL.md` 拼 prompt，后台跑完不阻塞 HTTP（202 Accepted）

### 与 monorepo 其他包的关系

```
openworker (pnpm workspace)
├── apps/ap-web          ← 本应用（Web 看板）
├── apps/ap-cli          ← CLI 端（pnpm ap），共用 .agents 约定
├── apps/ap-agent        ← ApAgentWithAGUI 封装
├── packages/llm         ← DeepSeek 模型接入
├── packages/ui          ← AG-UI timeline 等共享 UI 逻辑
└── packages/agent/tools/base-agent/shared ...
```

`predev` 会先 turbo build 上游包（`@openworker/llm`、`@openworker/tools`、`@openworker/base-agent`），保证 Agent 依赖可用。

### 配置与启动

- 开发：`pnpm ap-web:dev` → http://localhost:3011
- DeepSeek API Key：配置抽屉填写，或环境变量 `DEEPSEEK_API_KEY`（会从仓库根、`apps/ap-cli`、`apps/ap-web` 的 `.env` 加载）
- 不做 static export，因为必须 Node 运行时读写 markdown

## 设计特点

1. **本地优先**：无数据库，markdown + JSON 文件即真相源，与 CLI 工具链对齐
2. **目录即状态**：任务列由文件位置决定，移动 = 改目录 + 同步 markdown Status
3. **SSE 实时**：文件变更 → 防抖 → 重读 → 推送，前端无需轮询
4. **Agent 进程内运行**：Job 存在 Node 进程内存 Map 中，重启服务会丢失运行中状态
5. **双 cwd 语义**：用户启动目录 vs 仓库根，分别服务「任务数据」与「Agent/Skill 执行」

## Consequences

- **正面：** 与 ap-cli 共用 `.agents` 约定，任务可在 CLI 与 Web 间无缝切换；文件即数据，便于 git 追踪与人工编辑
- **负面 / 风险：** Agent 运行状态在进程内存中，服务重启会中断；`INIT_CWD` 与仓库根两套路径若混用可能导致读写不同 `.agents` 树
- **后续工作：** 见 [AI-PIPELINE 总览](./ap-overview.md) 与 [ap-cli 架构](./ap-cli-overview.md)
