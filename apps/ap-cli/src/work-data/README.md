# 目录说明

本目录是 work-data **种子**。`ap` 启动时拷贝到 `.agents/ap-config/work-data`；`*-template.md` 会覆盖已有文件，其余同名文件不覆盖。AI 只处理 `.agents/ap-config/work-data`。

```text
.agents/ap-config/work-data/
├── README.md
├── tasks/
│   ├── task-template.md   ← 模板，安装时覆盖；初始 Status 为 TODO
│   ├── todo/              ← TODO：待执行；创建任务写到这里
│   ├── doing/             ← DOING：开始执行后放这里
│   ├── plan/              ← PLAN：仅人工使用
│   ├── blocked/           ← BLOCKED：未填写、文档不合格、或 Agent 无法处理
│   └── done/              ← DONE：执行完成
│
└── decisions/             ← 已确认的架构决策
    └── decision-template.md   ← 模板，安装时覆盖
```

# decisions

- 用 `ap decision-create [--name <文件名>]` 从模板创建
- 未指定 `--name` 时文件名为 `decision-YYYYMMDDHHmmSS.md`
- AI 可以阅读但不可以修改、创建、删除 Decision
- AI 可以提出新的 Decision，但不应该擅自修改已有 Decision

# tasks

- 用 `ap task-create [--name <文件名>]` 从模板创建到 `todo/`，初始 Status 为 TODO
- 未指定 `--name` 时文件名为 `task-YYYYMMDDHHmmSS.md`
- 任务名称优先使用中文，如：实现用户登录
- 只执行 Status 为 TODO 的任务；开始执行时移到 `doing/` 并改为 DOING
- 执行时按 Priority：P0 > P1 > P2 > P3；同级编号小的先做
- 未填写、文档不合格、或 Agent 无法处理时移到 `blocked/` 并改为 BLOCKED，不要猜着做
- `plan/` 仅供人工使用；AI 不读取、不执行、不写入
- P0 任务一旦阻塞，停止执行其他任务
- 完成后移到 `done/` 并改为 DONE
- 只有当前任务需要历史上下文时，才读取 `done/`
- 执行流程见 `apps/ap-cli/src/skills/ap-task-execute/SKILL.md`
