---
name: se-task-executor
description: >
  执行项目中由 .ai/tasks/ 管理的开发任务。
  当用户要求 Agent 执行任务、连续执行多个任务、继续下一个可执行任务，
  或自主完成任务队列时使用。
  Skill 会发现可执行任务、检查依赖和相关架构决策、执行任务、进行验证、
  更新任务状态、归档已完成任务，并继续寻找下一个可执行任务。
  遇到需要人决策的任务时，将其移到 .ai/tasks/plan/ 并改名为 TASK-xxx-plan.md，
  然后继续执行其他可执行任务；不要停下来等待，也不要执行或归档 plan/ 中的任务。
license: MIT
metadata:
  version: '0.2.0'
  author: Wang Zhang
---

# SE Task Executor

负责执行 `.ai/tasks/active/` 中定义的开发任务。

任务文件是任务需求的主要来源。

项目级规则由 `AGENTS.md` 定义。

架构决策由 `.ai/decisions/` 中的 ADR 定义。

不要自行创造任务中没有提出的需求。

---

## 快速开始

Skill 激活后：

1. 阅读适用范围内的 `AGENTS.md`。
2. 检查 `.ai/tasks/active/`（不要扫描 `plan/`）。
3. 发现当前任务。
4. 检查任务依赖关系。
5. 选择当前可以执行的任务。
6. 阅读完整的 TASK 文件。
7. 检查与任务相关的架构决策。
8. 若需要人决策：移到 `plan/`，改名为 `TASK-xxx-plan.md`，继续下一件可执行任务。
9. 按照任务要求实现。
10. 执行测试和其他必要验证。
11. 更新 TASK 文件。
12. 将**本次从 active/ 成功做完**的任务归档。
13. 重新扫描 `active/`，并继续执行下一个可执行任务。

只有在以下情况下才停止：

- 没有可执行任务（`active/` 已空，或剩下的都因依赖未就绪而跳过）；
- 任务无法安全完成，且没有其他可执行任务；
- 用户明确要求停止。

需要人决策 **不是** 停止条件。把它放到 `plan/` 后继续。

---

## 任务目录

```text
.ai/tasks/
├── active/     ← 本技能只从这里领取任务
├── plan/       ← 需人决策；本技能只写入，不执行、不归档
├── blocked/    ← 非决策类阻塞
└── archive/
    └── 年份/
```

处理规则：

- **只执行 `active/`。** 默认不读取、不执行、不归档 `plan/`。
- **需人决策 → `plan/`。** 见下方「移入 plan/」。
- **非决策类阻塞 → `blocked/`。** 例如外部环境不具备、密钥缺失。写明原因后继续其他可执行任务。
- **依赖未完成 → 跳过本轮。** 不要因此把任务移到 `plan/` 或 `blocked/`。
- 用户**明确要求执行**某个 `plan/` 任务时：可以执行，但完成后**不要归档**，提醒用户手动移到 `archive/<年份>/`。

---

## 移入 plan/

出现以下任一情况时，视为需要人决策，**不要停下来问，也不要猜着做**：

- 产品行为有多种合理解释，任务未选定；
- 需要新的 ADR，或必须确认架构方向；
- 需求互相冲突，或与已有 ADR 冲突；
- 范围过大、边界不清，无法安全实现；
- 验收标准缺失或无法客观验证；
- 将改动公共契约 / 跨 `apps`·`services`·`packages`，但 ADR 未允许。

操作：

1. 在 TASK 中把 `Status` 改为 `PLAN`。
2. 写入 `## Decision Needed`，列出缺什么决策（具体、可回答）。
3. 将文件从 `active/` 移到 `plan/`。
4. 改名为 `TASK-<编号>-plan.md`（保留原编号，丢掉原短名）。  
   例：`TASK-001-用户登录.md` → `TASK-001-plan.md`
5. 向用户简要说明移入了哪条、缺什么决策，然后继续下一件可执行任务。

不要在移入 `plan/` 时实现任何代码。不要把 `plan/` 里的文件再移回 `active/`。

详细判定与反例见 [references/REFERENCE.md](references/REFERENCE.md)。

---

## 执行与归档

对 `active/` 中可执行且依赖已满足的任务：

1. 按 TASK 的 Goal / Scope / Requirements / Constraints / Acceptance Criteria 实现。
2. 跑必要验证（测试、`pnpm lint:fix`、必要时 `pnpm typecheck`）。
3. 把 `Status` 设为 `COMPLETED`，填写 Completion。
4. 移到 `.ai/tasks/archive/<年份>/`，文件名保持原样。

`plan/` 中的任务即使本次被明确要求执行完毕，也不得移入 `archive/`。

---

## 硬性约束

- 不要自行创造任务中没有提出的需求。
- 不要修改、创建、删除 `.ai/decisions/` 中的 ADR；需要新决策时写入 `Decision Needed` 并移入 `plan/`。
- 不要执行或「顺便澄清」`plan/` 里的任务，除非用户点名要求执行某一条。
- 冲突时移入 `plan/`，不要选边实现。

---

## 附加资源

- 需人决策判定与命名：[references/REFERENCE.md](references/REFERENCE.md)
- 任务模板：`.ai/task-template.md`
- 目录约定：`.ai/README.md`
- 架构决策：`.ai/decisions/`
