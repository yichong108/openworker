---
name: ap-refactor
description: >
  对现有代码做行为保持的结构化重构：抽取、重命名、拆分模块、消除重复、理顺依赖。
  不新增功能，不顺手修复无关缺陷，不扩大任务范围。
  当用户要求重构、整理代码、提取函数/组件、拆分文件、降低耦合、消除重复，
  或 .agents/ap-config/work-data/tasks/ 中存在重构类任务时使用。
  纯功能实现、按需求开发任务应使用 ap-task-execute，不要用本技能代替。
license: MIT
metadata:
  version: '0.1.2'
  author: Wang Zhang
---

# AP Refactor

负责在**不改变可观察行为**的前提下，改善现有代码结构。

任务文件（若存在）是重构范围与约束的主要来源。用户口头指定的文件/模块同样构成范围。

项目级规则由 `.agents/AGENTS.md` 定义。架构决策由 `.agents/ap-config/work-data/decisions/` 中的 ADR 定义。

不要把重构做成新功能、不要顺手修无关 bug、不要自行发明任务中未提出的需求。

---

## 与 ap-task-execute 的区别

|      | ap-task-execute      | ap-refactor                    |
| ---- | -------------------- | ------------------------------ |
| 目标 | 实现任务要求的新行为 | 只改结构，行为不变             |
| 允许 | 按需求新增/修改功能  | 抽取、移动、重命名、拆分、去重 |
| 禁止 | 创造任务外需求       | 新功能、无关修复、扩大范围     |

若一次改动同时需要新行为和结构变化：先停下来，拆成「实现任务」与「重构任务」，或请用户确认优先级。不要在同一次编辑里混做。

---

## 原则

1. **行为保持。** 对外可观察的输入/输出、错误、副作用、协议与类型契约保持不变。
2. **小步前进。** 一次只做一种结构变换，验证后再做下一步。禁止大范围重写。
3. **范围最小。** 只改达成目标所必需的文件。禁止「顺便整理」邻近模块。
4. **测试护栏。** 没有足以锁定当前行为的测试或等价验证时，先补表征测试（characterization），再改结构。
5. **服从 ADR。** 只读 `.agents/ap-config/work-data/decisions/`。需要新架构决策时提出方案并停止，不得擅自创建或修改 ADR。
6. **可回退。** 每一步都应能独立理解、独立验证；验证失败立即回退该步，不要叠加修复。

---

## 快速开始

Skill 激活后：

1. 阅读适用范围内的 `.agents/AGENTS.md`。
2. 确定入口：`.agents/ap-config/work-data/tasks/todo/` 中 Status 为 TODO 的重构任务，或用户指定的代码范围。
3. 阅读完整 TASK（若有）及相关 ADR。
4. 摸清当前行为：调用链、公共 API、协议、类型导出、副作用。
5. 写出不变量与明确的结构目标（见下方模板）。
6. 确认护栏：现有测试能否失败于行为回归；不足则先补表征测试。
7. 按小步实施重构。
8. 每一步后运行相关测试与必要验证（`pnpm typecheck`、`pnpm lint` / `pnpm lint:fix`）。
9. 更新 TASK 文件（若有）并移到 `done/`；向用户报告做了什么、没做什么、行为为何不变。

只有在以下情况下才停止：

- 没有可执行的重构范围；
- 继续下去会改变行为，或必须改公共契约（若来自 TASK：移入 `blocked/` 并改为 `BLOCKED` 后，继续其他可安全重构的 TODO）；
- 缺少护栏，无法安全证明行为保持；
- 任务无法安全完成；
- 用户明确要求停止。

需要用户确认架构决策、或需求/范围与 ADR 冲突：**不是**停止整个队列的条件。把该 TASK 按 executor 同样规则移到 `blocked/` 并改为 `BLOCKED` 后，改做下一件可安全重构的 TODO。`plan/` 仅供人工使用，本技能不读写。

---

## 工作流

### 1. 锁定范围

优先使用任务的 `Scope` / `Constraints`。无任务时，以用户点名的目录、文件、符号为界。

范围外的重复、坏味道只记录在 Notes，不在本次修改。

### 2. 陈述不变量与目标

动手前用几句话写清（可写在回复或 TASK 的 Implementation 草稿中）：

```text
不变量：<哪些 API / 协议 / 错误 / 副作用必须保持>
结构目标：<例如 抽出 X、把 Y 从 A 挪到 B、去掉 Z 处重复>
非目标：<本次不做的功能、修复、重构>
```

写不清楚就不开始改代码。

### 3. 建立护栏

- 已有针对性测试：先跑一遍，确认基线为绿。
- 没有测试：先添加只描述**当前实际行为**的表征测试，不要借机改行为。
- 难以单测的边界（IPC、AG-UI、原生层）：至少做类型检查，并说明手动验证步骤。

### 4. 小步变换

优先使用可机械验证的手法，例如：重命名、抽取函数/组件、内联、移动文件、拆分模块、消除重复、收紧可见性。

每一步：

1. 只做一种变换。
2. 更新调用点与导出，保持编译通过。
3. 导出函数按 `.agents/AGENTS.md` 补注释（用途、意图、为何如此实现）。
4. 跑相关测试与 lint；失败则回退该步。

详细手法与气味对照见 [references/REFERENCE.md](references/REFERENCE.md)。

### 5. 收尾

- 跑 `pnpm lint:fix`，必要时 `pnpm typecheck`。
- 对照验收标准：结构目标达到，不变量仍成立，范围外无改动。
- 若有 TASK：开始执行时移到 `doing/` 并改为 `DOING`；完成后把 Status 设为 `DONE`，填写完成说明，再移到 `.agents/ap-config/work-data/tasks/done/`。
- 报告中区分「结构变化」与「行为未变的证据」。

---

## 硬性约束

- 不新增功能开关、字段、接口、依赖或用户可见文案，除非任务把它们列为结构迁移的必要部分（例如移动已有导出）。
- 不修改现有公共 API / IPC / HTTP / AG-UI 契约的语义；仅允许在不改变语义的前提下调整内部组织。
- 不引入新依赖；共享版本只走 pnpm catalog，且重构默认不应改 catalog。
- 不跨 `apps` / `services` / `packages` 挪代码，除非 ADR 已允许且任务明确要求。
- 不删除「看起来没用」的代码，除非能证明无引用且任务允许。
- 不把格式化、大规模 rename、目录搬迁混在同一步。

---

## 任务目录

任务使用以下目录表示生命周期：

```text
.agents/ap-config/work-data/tasks/
├── todo/     ← TODO，只领取此状态
├── doing/      ← DOING
├── plan/       ← PLAN，仅人工；本技能不读写
├── blocked/    ← BLOCKED
└── done/       ← DONE
```

处理 `.agents/ap-config/work-data/tasks/todo/` 时：

- 只领取 Status 为 TODO、目标为重构/结构调整、且依赖已满足的任务。
- 功能实现类任务留给 `ap-task-execute`。
- 开始执行：移到 `doing/`，Status 改为 `DOING`。
- 架构/数据模型/API/核心流程改变、与其他任务根本性冲突、需要产品/架构决策、需求冲突：移到 `blocked/`，Status 改为 `BLOCKED`，写入 Agent Notes，然后继续下一件可安全重构的 TODO。
- 依赖未完成：本轮跳过。外部环境不具备或文档不合格：移到 `blocked/` 并改为 `BLOCKED`。
- 不要创造任务中没有的需求。
- 不要读取、执行或改写 `plan/`。

---

## 完成后的说明

向用户（及 TASK `Agent Notes`）写明：

- **Implementation：** 做了哪些结构变换，动了哪些文件。
- **Tests：** 跑了什么，结果如何；若补了表征测试，写明锁定的是哪段当前行为。
- **Validation：** lint / typecheck / 其他验证。
- **Notes：** 未做的气味、建议的后续重构、任何与 ADR 相关的疑问。

---

## 附加资源

- 重构手法、气味与验证清单：[references/REFERENCE.md](references/REFERENCE.md)
- 任务模板：`.agents/ap-config/work-data/tasks/task-template.md`
- 架构决策：`.agents/ap-config/work-data/decisions/`
