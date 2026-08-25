# 目录说明

本目录是 work-data **种子**。`ap` 启动时拷贝到 `.agents/ap-config/work-data`；`*-template.md` 会覆盖已有文件，其余同名文件不覆盖。AI 只处理 `.agents/ap-config/work-data`。

```text
.agents/ap-config/work-data/
├── README.md
├── tasks/
│   ├── task-template.md   ← 模板，安装时覆盖
│   ├── active/            ← AI 当前可以直接执行的任务
│   ├── plan/              ← 需要人决策 / 澄清，由人处理
│   ├── blocked/           ← 未填写，或执行过程中被外部条件阻塞
│   └── archive/           ← AI 归档 active 完成任务；plan 完成后由人归档
│       └── 年份/
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

- 用 `ap task-create [--name <文件名>]` 从模板创建到 `active/`
- 未指定 `--name` 时文件名为 `task-YYYYMMDDHHmmSS.md`
- 任务名称优先使用中文，如：实现用户登录
- 执行时按 Priority：P0 > P1 > P2 > P3；同级编号小的先做
- 未填写的任务移到 `blocked/`，不要猜着做
- P0 任务一旦阻塞，停止执行其他任务
- 只有当前任务需要历史上下文时，才读取 archive/
- 执行流程见 `ap/src/skills/ap-task-execute/SKILL.md`
