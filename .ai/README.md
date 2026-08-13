# 目录说明

.ai/
├── task-template.md ← 模板，不动
├── decision-template.md ← 模板，不动
│
├── tasks/
│ ├── active/ ← AI正在处理/待处理
│ ├── blocked/ ← AI无法继续的
│ └── archive/ ← 历史任务
│
└── decisions/ ← 已确认的架构决策

# decisions

- 文件名：`ADR-<英文短名>.md`，如 `ADR-module-map.md`
- AI 可以阅读但不可以修改、创建、删除 Decision
- AI 可以提出新的 Decision，但不应该擅自修改已有 Decision

# tasks

- <任务名称>优先使用中文，如：实现用户登录；文件名使用TASK-<数字编号>-<英文>，如：TASK-001-用户登录.md
- 只有当前任务需要历史上下文时，才读取 archive/
