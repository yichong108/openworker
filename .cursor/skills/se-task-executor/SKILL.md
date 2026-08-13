---
name: se-task-executor
description: >
  执行项目中由 .ai/tasks/ 管理的开发任务。
  当用户要求 Agent 执行任务、继续下一个可执行任务时使用。
  每次调用只执行一件任务，禁止并发执行多件。
  Skill 会发现可执行任务、检查依赖和相关架构决策、执行任务、进行验证、
  更新任务状态、归档已完成任务，然后自动 commit（不 push）并停止。
  遇到需要人决策的任务时，将其移到 .ai/tasks/plan/ 并改名为 TASK-xxx-plan.md；
  若本轮尚未开始实现任何任务，可再找下一件可执行任务。
  不要执行或归档 plan/ 中的任务。
license: MIT
metadata:
  version: '0.3.0'
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
5. 选择当前可以执行的**一件**任务。
6. 阅读完整的 TASK 文件。
7. 检查与任务相关的架构决策。
8. 若需要人决策：移到 `plan/`，改名为 `TASK-xxx-plan.md`；若本轮尚未开始实现，可再找下一件可执行任务。
9. 按照任务要求实现（本轮只实现这一件）。
10. 执行测试和其他必要验证。
11. 更新 TASK 文件。
12. 将**本次从 active/ 成功做完**的任务归档。
13. 归档后立即 git commit（含实现改动与归档文件），**不要 push**。
14. **停止。** 不要继续执行下一件任务。向用户报告完成情况与 commit；若 `active/` 中还有可执行任务，提醒再次调用本技能。

只有在以下情况下才停止：

- 已成功执行并归档 **一件** 任务（即使 `active/` 中还有其他可执行任务）；
- 没有可执行任务（`active/` 已空，或剩下的都因依赖未就绪而跳过）；
- 已开始实现的任务无法安全完成（能回退则回退）；不要改去做另一件；
- 用户明确要求停止。

需要人决策 **不是** 停止条件（前提是本轮还没开始写代码）。把它放到 `plan/` 后，可再找下一件可执行任务。

---

## 一次一件，禁止并发

- **每次调用最多实现一件 TASK。** 即使用户要求「连续做多件 / 把队列做完」，本轮也只做一件；归档并 commit 后停止，提示再次调用。
- **禁止并发。** 不要用并行 Agent、子任务或同时打开多份 TASK 来实现多件任务。探索当前这一件时可以用只读搜索，但实现阶段始终只对应一件 TASK。
- **尚未开始实现之前**（只做了移入 `plan/`、`blocked/`、或因依赖跳过）：可以继续挑选下一件候选。
- **一旦开始改代码**，本轮就绑定这一件，直到归档 commit 或因无法安全完成而停止。

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
- **非决策类阻塞 → `blocked/`。** 例如外部环境不具备、密钥缺失。写明原因后，若本轮尚未开始实现，可再找其他可执行任务。
- **依赖未完成 → 跳过本轮该条。** 不要因此把任务移到 `plan/` 或 `blocked/`。
- 用户**明确要求执行**某个 `plan/` 任务时：可以执行（仍算本轮唯一一件），但完成后**不要归档、不要自动 commit**，提醒用户手动移到 `archive/<年份>/`。

---

## 移入 plan/

出现以下任一情况时，视为需要人决策，**不要停下来问，也不要猜着做**：

- 架构/数据模型/API/核心流程改变 → 进入 plan/
- 可能与其他任务产生根本性冲突 → 进入 plan/
- 产品行为有多种合理解释，任务未选定；
- 需要新的 ADR，或必须确认架构方向；
- 需求互相冲突，或与已有 ADR 冲突；
- 范围过大、边界不清，无法安全实现；
- 验收标准缺失或无法客观验证；
- 将改动公共契约 / 跨 `apps`·`services`·`packages`，但 ADR 未允许。

判定「与其他任务冲突」时，扫描 `active/`、`plan/`、`blocked/` 中的相邻 TASK。只要可能在目标、模型、API 或流程上互相否定，就进入 `plan/`，不要自行调和。

操作：

1. 在 TASK 中把 `Status` 改为 `PLAN`。
2. 写入 `## Decision Needed`，列出缺什么决策（具体、可回答）。
3. 将文件从 `active/` 移到 `plan/`。
4. 改名为 `TASK-<编号>-plan.md`（保留原编号，丢掉原短名）。  
   例：`TASK-001-用户登录.md` → `TASK-001-plan.md`
5. 向用户简要说明移入了哪条、缺什么决策；若本轮尚未开始实现，可再找下一件可执行任务。

不要在移入 `plan/` 时实现任何代码。不要把 `plan/` 里的文件再移回 `active/`。不要因移入 `plan/` 而自动 commit。

详细判定与反例见 [references/REFERENCE.md](references/REFERENCE.md)。

---

## 执行与归档

对 `active/` 中可执行且依赖已满足的**一件**任务：

1. 按 TASK 的 Goal / Scope / Requirements / Constraints / Acceptance Criteria 实现。
2. 跑必要验证（测试、`pnpm lint:fix`、必要时 `pnpm typecheck`）。
3. 把 `Status` 设为 `COMPLETED`，填写 Completion。
4. 移到 `.ai/tasks/archive/<年份>/`，文件名保持原样。
5. 按下方「归档后提交」创建 commit，然后停止。

`plan/` 中的任务即使本次被明确要求执行完毕，也不得移入 `archive/`，也不得自动 commit。

---

## 归档后提交

归档成功后立刻创建 git commit，然后停止：

1. 并行查看 `git status`、`git diff`、`git log`（近期风格）。
2. 暂存本次任务相关改动（实现代码、归档的 TASK 文件、从 `active/` 的移除）。不要暂存密钥、`.env`、凭证文件。
3. 按 Conventional Commits 写**中文**说明：祈使语气，最多 50 个字符，不加句号。优先带上任务编号。  
   例：`feat(auth): 完成 TASK-001 用户登录`
4. commit 后跑 `git status` 确认成功。
5. **禁止 push**（包括 `git push`、设 upstream、force push）。
6. 向用户报告 commit 说明；若 `active/` 仍有可执行任务，提示再次调用本技能。

不要在移入 `plan/` 或 `blocked/` 时自动 commit。

---

## 硬性约束

- 不要自行创造任务中没有提出的需求。
- 不要修改、创建、删除 `.ai/decisions/` 中的 ADR；需要新决策时写入 `Decision Needed` 并移入 `plan/`。
- 不要执行或「顺便澄清」`plan/` 里的任务，除非用户点名要求执行某一条。
- 冲突时移入 `plan/`，不要选边实现。
- 每次调用最多实现一件任务；禁止并发执行多件。
- 从 `active/` 归档后必须 commit；禁止 push。

---

## 附加资源

- 需人决策判定与命名：[references/REFERENCE.md](references/REFERENCE.md)
- 任务模板：`.ai/task-template.md`
- 目录约定：`.ai/README.md`
- 架构决策：`.ai/decisions/`
