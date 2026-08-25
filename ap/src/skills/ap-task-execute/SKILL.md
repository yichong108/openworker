---
name: ap-task-execute
description: >
  执行项目中由 .agents/ap-config/work-data/tasks/ 管理的开发任务。
  当用户要求 Agent 执行任务、连续执行多个任务、继续下一个可执行任务，
  或自主完成任务队列时使用。
  同一时刻只执行一件任务，禁止并发；可以串行一件接着一件，按优先级选取。
  Skill 会发现可执行任务、按 P0→P3 选取、检查依赖和相关架构决策、执行任务、进行验证、
  更新任务状态、归档已完成任务，自动 commit（不 push），再继续下一件。
  遇到未填写的任务时移到 blocked/，不要猜着做。
  P0 任务一旦阻塞（含移入 blocked/ 或 blocked/ 中已有 P0），停止执行其他任务。
  遇到需要人决策的任务时，将其移到 .agents/ap-config/work-data/tasks/plan/ 并改名为 TASK-xxx-plan.md，
  然后继续其他可执行任务；不要停下来等待，也不要执行或归档 plan/ 中的任务。
license: MIT
metadata:
  version: '0.7.0'
  author: Wang Zhang
---

# AP Task Execute

负责执行 `.agents/ap-config/work-data/tasks/active/` 中定义的开发任务。

任务文件是任务需求的主要来源。

项目级规则由 `.agents/AGENTS.md` 定义。

架构决策由 `.agents/ap-config/work-data/decisions/` 中的 ADR 定义。

不要自行创造任务中没有提出的需求。

---

## 执行任务流程

1. 若 `blocked/` 中已有 P0 任务，停止并告知用户，不要执行任何其他任务。
2. 扫描 `active/`，按优先级（P0→P3）选取一件任务。
3. 判断该任务是否可直接执行：
   - 如果「未填写」，则：
     1. 移到 `blocked/`，写明原因。不要猜着补全或执行。
     2. 若该任务为 P0，停止全部后续任务。
     3. 否则继续从 `active/` 按优先级选取下一件，循环本流程。
   - 如果「可执行」，则：
     1. 仅执行这一件任务，不并行处理其他任务。
     2. 若执行过程中阻塞，移到 `blocked/`：P0 则停止全部后续任务；非 P0 则继续下一件。
     3. 完成后，归档到 `archive/`。
     4. 执行 git commit，但不自动 push。
     5. 继续从 `active/` 按优先级选取下一件任务，循环本流程。
   - 如果「不可直接执行，需要人决策」，则：
     1. 移动该任务至 `plan/`，改名为 `task-xxx-plan.md`。
     2. 人澄清需求；本技能不执行、不归档 `plan/` 中的任务。
     3. 本技能继续按优先级处理 `active/` 中其他可执行任务，不要停下来等待。
     4. `plan/` 任务处理完成后，由人手动归档到 `archive/`。

---

## 快速开始

Skill 激活后：

1. 阅读适用范围内的 `.agents/AGENTS.md`。
2. 若 `blocked/` 中已有 P0，停止并告知用户，不要领取其他任务。
3. 检查 `.agents/ap-config/work-data/tasks/active/`（不要扫描 `plan/`）。
4. 发现当前任务。
5. 检查任务依赖关系与优先级。
6. 按「选取顺序」选择当前可以执行的**一件**任务。
7. 阅读完整的 TASK 文件。
8. 若未填写：移到 `blocked/`；P0 则停止，否则按优先级继续下一件。
9. 检查与任务相关的架构决策。
10. 若需要人决策：移到 `plan/`，改名为 `TASK-xxx-plan.md`，按优先级继续下一件可执行任务。
11. 按照任务要求实现（同一时刻只实现这一件）。
12. 执行过程中若阻塞：移到 `blocked/`；P0 则停止，否则继续下一件。
13. 执行测试和其他必要验证。
14. 更新 TASK 文件。
15. 将**本次从 active/ 成功做完**的任务归档。
16. 归档后立即 git commit（含实现改动与归档文件），**不要 push**。
17. 重新扫描 `active/`，按优先级串行执行下一件可执行任务。

只有在以下情况下才停止：

- 没有可执行任务（`active/` 已空，或剩下的都因依赖未就绪而跳过）；
- **P0 任务阻塞**（本轮移入 `blocked/`，或 `blocked/` 中已有 P0）；
- 当前任务无法安全完成且无法回退，工作区不干净，不能开始下一件；
- 用户明确要求停止。

需要人决策 **不是** 停止条件。把它放到 `plan/` 后继续。
非 P0 的未填写 / 非决策类阻塞 **不是** 停止条件。把它放到 `blocked/` 后继续。

---

## 同时一件，允许串行

- **同一时刻只实现一件 TASK。** 禁止用并行 Agent、子任务或同时打开多份 TASK 来实现多件。
- **允许串行。** 当前件归档并 commit 后，再扫描 `active/`，按优先级接着做下一件。
- **不要叠做。** 上一件尚未归档 commit 时，不要开始下一件的实现。
- 探索当前这一件时可以用只读搜索；实现阶段始终只对应一件 TASK。

---

## 选取顺序

每次只选 **一件** 当前可执行任务（依赖已满足、不在 `plan/` / `blocked/`、且已填写）：

1. **优先级：** P0 > P1 > P2 > P3。缺省或无法识别视为 P2。
2. **同优先级：** 编号小的先做（从文件名 `TASK-<编号>` 提取）。

用户点名某条 TASK 时，先做那一条（仍同一时刻只一件），做完再按上序继续。
用户点名的任务若未填写，仍移入 `blocked/`，不要猜着做。

高优先级但需人决策 / 阻塞 / 依赖未就绪：按规则移走或跳过，不要降级猜着做；非 P0 阻塞则改选下一件可执行的，P0 阻塞则停止。

---

## 任务目录

```text
.agents/ap-config/work-data/tasks/
├── active/     ← 本技能只从这里领取任务
├── plan/       ← 需人决策；本技能只写入，不执行、不归档
├── blocked/    ← 未填写或非决策类阻塞
└── archive/
    └── 年份/
```

处理规则：

- **只执行 `active/`。** 默认不读取、不执行、不归档 `plan/`。
- **未填写 → `blocked/`。** 见下方「未填写判定」。不要猜着补全。非 P0 继续其他任务；P0 停止。
- **需人决策 → `plan/`。** 见下方「移入 plan/」。
- **非决策类阻塞 → `blocked/`。** 例如外部环境不具备、密钥缺失。写明原因。非 P0 继续其他可执行任务；P0 停止。
- **依赖未完成 → 跳过本轮该条。** 不要因此把任务移到 `plan/` 或 `blocked/`。
- 用户**明确要求执行**某个 `plan/` 任务时：可以执行（仍同一时刻只这一件），但完成后**不要归档、不要自动 commit**，提醒用户手动移到 `archive/<年份>/`，然后继续 `active/` 中的下一件。

---

## 未填写判定

出现以下任一情况，视为未填写，**不要猜着补全标题或需求**：

- 标题仍为 `<任务名称>`、空白，或明显未改模板占位。
- `Requirements(Required)` 无实质条目（空、仅 `-` / `- None`，或仍是模板占位，看不出要做什么）。
- 必填项整体仍是刚从模板拷出的默认内容，无法确定目标。

仅 `Context` 为 `- None`、但标题与 Requirements 已写明，不算未填写。

用户在对话里当场给出该任务的需求时，先写入 TASK 再执行，不要把它当未填写。

---

## 移入 blocked/

出现以下任一情况时，移入 `blocked/`，**不要猜着做**：

- 任务未填写（见「未填写判定」）；
- 执行过程中出现非决策类阻塞（外部环境不具备、密钥缺失、依赖系统不可用等）。

操作：

1. 在 TASK 中把 `Status` 改为 `BLOCKED`。
2. 在 `## Agent Notes` 写明阻塞原因（具体、可核对）。
3. 将文件从 `active/` 移到 `blocked/`，**保留原文件名**。
4. 向用户说明移入了哪条、为何阻塞。
5. **若该任务为 P0：停止，不要再选取其他任务。**
6. 若非 P0：按优先级继续下一件可执行任务。

不要在移入 `blocked/` 时实现任何代码。不要因移入 `blocked/` 而自动 commit。

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
5. 向用户简要说明移入了哪条、缺什么决策，然后按优先级继续下一件可执行任务。

不要在移入 `plan/` 时实现任何代码。不要把 `plan/` 里的文件再移回 `active/`。不要因移入 `plan/` 而自动 commit。

详细判定与反例见 [references/REFERENCE.md](references/REFERENCE.md)。

---

## 执行与归档

对 `active/` 中可执行且依赖已满足的任务，**一次只做一件**：

1. 按 TASK 的 Goal / Scope / Requirements / Constraints / Acceptance Criteria 实现。
2. 跑必要验证（测试、`pnpm lint:fix`、必要时 `pnpm typecheck`）。
3. 把 `Status` 设为 `COMPLETED`，填写 Completion。
4. 移到 `.agents/ap-config/work-data/tasks/archive/<年份>/`，文件名保持原样。
5. 按下方「归档后提交」创建 commit。
6. 再扫描 `active/`，按优先级串行执行下一件。

`plan/` 中的任务即使本次被明确要求执行完毕，也不得移入 `archive/`，也不得自动 commit。

---

## 归档后提交

每件从 `active/` 归档成功后立刻创建 **一次** git commit，然后才可以开始下一件：

1. 并行查看 `git status`、`git diff`、`git log`（近期风格）。
2. 暂存本次任务相关改动（实现代码、归档的 TASK 文件、从 `active/` 的移除）。不要暂存密钥、`.env`、凭证文件。
3. 按 Conventional Commits 写**中文**说明：祈使语气，最多 50 个字符，不加句号。优先带上任务编号。  
   例：`feat(auth): 完成 TASK-001 用户登录`
4. commit 后跑 `git status` 确认成功。
5. **禁止 push**（包括 `git push`、设 upstream、force push）。
6. 向用户报告本件的 commit 说明，然后按优先级继续下一件可执行任务。

不要把多件任务的改动打进同一次 commit。不要在移入 `plan/` 或 `blocked/` 时自动 commit。

---

## 硬性约束

- 不要自行创造任务中没有提出的需求。
- 未填写的任务必须移入 `blocked/`，不得猜着补全或执行。
- P0 一旦阻塞（`blocked/` 中已有或本轮刚移入），必须停止，不得继续其他任务。
- 不要修改、创建、删除 `.agents/ap-config/work-data/decisions/` 中的 ADR；需要新决策时写入 `Decision Needed` 并移入 `plan/`。
- 不要执行或「顺便澄清」`plan/` 里的任务，除非用户点名要求执行某一条。
- 冲突时移入 `plan/`，不要选边实现。
- 同一时刻最多实现一件任务；禁止并发；允许串行；选取必须按优先级。
- 从 `active/` 归档后必须 commit；禁止 push。

---

## 附加资源

- 需人决策判定与命名：[references/REFERENCE.md](references/REFERENCE.md)
- 任务模板：`.agents/ap-config/work-data/tasks/task-template.md`
- 目录约定：`.agents/ap-config/work-data/README.md`
- 架构决策：`.agents/ap-config/work-data/decisions/`
