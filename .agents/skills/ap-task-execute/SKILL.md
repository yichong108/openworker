---
name: ap-task-execute
description: >
  执行项目中由 .agents/ap-config/work-data/tasks/ 管理的开发任务。
  当用户要求 Agent 执行任务、连续执行多个任务、继续下一个可执行任务，
  或自主完成任务队列时使用。
  同一时刻只执行一件任务，禁止并发；可以串行一件接着一件，按优先级选取。
  只执行 Status 为 TODO 的任务。开始执行时把任务文件移到 doing/ 并把状态改为 DOING。
  Skill 会发现可执行任务、按 P0→P3 选取、检查依赖和相关架构决策、执行任务、进行验证、
  更新任务状态、将完成任务移到 done/，自动 commit（不 push），再继续下一件。
  遇到未填写、文档不符合要求、或 Agent 无法处理的问题时移到 blocked/ 并改为 BLOCKED，不要猜着做。
  P0 任务一旦阻塞（含移入 blocked/ 或 blocked/ 中已有 P0），停止执行其他任务。
  plan/ 仅供人工使用；本技能不读取、不执行、不写入 plan/ 中的任务。
license: MIT
metadata:
  version: '0.9.0'
  author: Wang Zhang
---

# AP Task Execute

负责执行 `.agents/ap-config/work-data/tasks/todo/` 中 **Status 为 TODO** 的开发任务。

任务文件是任务需求的主要来源。

项目级规则由 `.agents/AGENTS.md` 定义。

架构决策由 `.agents/ap-config/work-data/decisions/` 中的 ADR 定义。

不要自行创造任务中没有提出的需求。

---

## 状态与目录

任务状态与所在文件夹必须一致：

| Status  | 目录       | 谁写入                         | 本技能是否执行 |
| ------- | ---------- | ------------------------------ | -------------- |
| TODO    | `todo/`    | 创建任务（初始状态）           | 是，仅此状态   |
| DOING   | `doing/`   | 本技能：开始执行时             | 否             |
| PLAN    | `plan/`    | **仅人工**                     | 否             |
| BLOCKED | `blocked/` | 本技能：无法处理或文档不合格时 | 否             |
| DONE    | `done/`    | 本技能：执行完成时             | 否             |

转换规则：

1. **创建：** 初始 Status 为 `TODO`，文件在 `todo/`。
2. **开始执行：** 把文件从 `todo/` 移到 `doing/`，Status 改为 `DOING`。
3. **无法继续：** Agent 处理不了、文档填写不符合要求等，把文件移到 `blocked/`，Status 改为 `BLOCKED`。
4. **完成：** 把文件从 `doing/` 移到 `done/`，Status 改为 `DONE`。
5. **PLAN：** 只给人用。本技能不得把任务改成 `PLAN`，不得移入 `plan/`，也不得执行其中的任务。

---

## 执行任务流程

1. 若 `blocked/` 中已有 P0 任务，停止并告知用户，不要执行任何其他任务。
2. 若 `doing/` 中已有任务，停止并告知用户：已有进行中的任务，不要再领取新的 TODO。不要自动继续执行 Status 为 `DOING` 的任务。
3. 扫描 `todo/`，只选取 **Status 为 TODO** 的任务，按优先级（P0→P3）取一件。Status 不是 TODO 的文件跳过，不要执行。
4. 判断该 TODO 任务是否可直接执行：
   - 如果「未填写 / 文档不符合要求 / Agent 无法处理」，则：
     1. 移到 `blocked/`，Status 改为 `BLOCKED`，写明原因。不要猜着补全或执行。
     2. 若该任务为 P0，停止全部后续任务。
     3. 否则继续从 `todo/` 按优先级选取下一件 TODO，循环本流程。
   - 如果「可执行」，则：
     1. 将文件从 `todo/` 移到 `doing/`，把 Status 改为 `DOING`。
     2. 仅执行这一件任务，不并行处理其他任务。
     3. 若执行过程中阻塞，从 `doing/` 移到 `blocked/`，Status 改为 `BLOCKED`：P0 则停止全部后续任务；非 P0 则继续下一件 TODO。
     4. 完成后，从 `doing/` 移到 `done/`，Status 改为 `DONE`。
     5. 执行 git commit，但不自动 push。
     6. 继续从 `todo/` 按优先级选取下一件 TODO，循环本流程。

不要扫描、读取需求、执行或改写 `plan/`。

---

## 快速开始

Skill 激活后：

1. 阅读适用范围内的 `.agents/AGENTS.md`。
2. 若 `blocked/` 中已有 P0，停止并告知用户，不要领取其他任务。
3. 若 `doing/` 非空，停止并告知用户，不要领取其他任务。
4. 检查 `.agents/ap-config/work-data/tasks/todo/`，只考虑 Status 为 `TODO` 的文件（不要扫描 `plan/`）。
5. 发现当前任务。
6. 检查任务依赖关系与优先级。
7. 按「选取顺序」选择当前可以执行的**一件** TODO 任务。
8. 阅读完整的 TASK 文件。
9. 若未填写、文档不符合要求、或 Agent 无法处理：移到 `blocked/` 并改为 `BLOCKED`；P0 则停止，否则按优先级继续下一件 TODO。
10. 将本件从 `todo/` 移到 `doing/`，Status 改为 `DOING`。
11. 检查与任务相关的架构决策。
12. 按照任务要求实现（同一时刻只实现这一件）。
13. 执行过程中若阻塞：从 `doing/` 移到 `blocked/` 并改为 `BLOCKED`；P0 则停止，否则继续下一件 TODO。
14. 执行测试和其他必要验证。
15. 更新 TASK 文件：Status 设为 `DONE`，填写完成说明。
16. 将本件从 `doing/` 移到 `done/`。
17. 完成后立即 git commit（含实现改动与任务文件移动），**不要 push**。
18. 重新扫描 `todo/`，按优先级串行执行下一件 TODO。

只有在以下情况下才停止：

- 没有可执行任务（`todo/` 中没有 Status 为 TODO 的任务，或剩下的都因依赖未就绪而跳过）；
- **`doing/` 中已有任务**；
- **P0 任务阻塞**（本轮移入 `blocked/`，或 `blocked/` 中已有 P0）；
- 当前任务无法安全完成且无法回退，工作区不干净，不能开始下一件；
- 用户明确要求停止。

非 P0 的未填写 / Agent 无法处理 **不是** 停止条件。把它放到 `blocked/` 后继续下一件 TODO。
`plan/` 中的任务不是可执行任务，忽略即可。

---

## 同时一件，允许串行

- **同一时刻只实现一件 TASK。** 禁止用并行 Agent、子任务或同时打开多份 TASK 来实现多件。
- **`doing/` 同时最多一份任务文件。** 领取新 TODO 前必须确认 `doing/` 为空。
- **允许串行。** 当前件移入 `done/` 并 commit 后，再扫描 `todo/`，按优先级接着做下一件 TODO。
- **不要叠做。** 上一件尚未移入 `done/` 并 commit 时，不要开始下一件的实现。
- 探索当前这一件时可以用只读搜索；实现阶段始终只对应一件 TASK。

---

## 选取顺序

每次只选 **一件** 当前可执行任务，必须同时满足：位于 `todo/`、**Status 为 TODO**、依赖已满足、且已填写：

1. **优先级：** P0 > P1 > P2 > P3。缺省或无法识别视为 P2。
2. **同优先级：** 编号小的先做（从文件名提取编号或时间戳）。

用户点名某条 TASK 时：仅当它位于 `todo/` 且 Status 为 TODO 时才执行（仍同一时刻只一件），做完再按上序继续。
用户点名的任务若 Status 不是 TODO（含 `DOING` / `PLAN` / `BLOCKED` / `DONE`），拒绝执行，说明须先由人改回 TODO 并放到 `todo/`。
用户点名的任务若未填写，仍移入 `blocked/`，不要猜着做。

高优先级但无法处理 / 阻塞 / 依赖未就绪：按规则移走或跳过，不要降级猜着做；非 P0 阻塞则改选下一件 TODO，P0 阻塞则停止。

---

## 任务目录

```text
.agents/ap-config/work-data/tasks/
├── todo/     ← TODO：本技能只从这里领取任务
├── doing/      ← DOING：开始执行后放这里
├── plan/       ← PLAN：仅人工使用；本技能不读、不写、不执行
├── blocked/    ← BLOCKED：未填写、文档不合格、或 Agent 无法处理
└── done/       ← DONE：执行完成
```

处理规则：

- **只执行 `todo/` 中 Status 为 TODO 的任务。**
- **开始执行 → `doing/` + `DOING`。**
- **未填写 / 文档不符合要求 / Agent 无法处理 → `blocked/` + `BLOCKED`。** 见下方判定。不要猜着补全。非 P0 继续其他 TODO；P0 停止。
- **不要读写 `plan/`。** 其中任务由人处理；本技能不得改名为 `*-plan.md`，不得把 Status 改为 `PLAN`。
- **依赖未完成 → 跳过本轮该条。** 不要因此把任务移到 `blocked/`。
- **完成 → `done/` + `DONE`。** 随后 commit，不 push。

---

## 未填写判定

出现以下任一情况，视为文档不符合要求，**不要猜着补全标题或需求**：

- 标题仍为 `<任务名称>`、空白，或明显未改模板占位。
- `Requirements(Required)` 无实质条目（空、仅 `-` / `- None`，或仍是模板占位，看不出要做什么）。
- 必填项整体仍是刚从模板拷出的默认内容，无法确定目标。

仅 `Context` 为 `- None`、但标题与 Requirements 已写明，不算未填写。

用户在对话里当场给出该任务的需求时，先写入 TASK 再执行，不要把它当未填写。

---

## 移入 blocked/

出现以下任一情况时，移入 `blocked/`，Status 改为 `BLOCKED`，**不要猜着做**：

- 任务未填写，或文档填写不符合要求（见「未填写判定」）；
- Agent 无法处理：例如需要人拍板、缺 ADR、需求冲突、范围不清、与其他任务根本性冲突、架构方向未定；
- 执行过程中阻塞（外部环境不具备、密钥缺失、依赖系统不可用等）。

操作：

1. 在 TASK 中把 `Task Status` 改为 `BLOCKED`。
2. 在 `# Agent Notes` 写明阻塞原因（具体、可核对）。
3. 将文件从 `todo/` 或 `doing/` 移到 `blocked/`，**保留原文件名**。
4. 向用户说明移入了哪条、为何阻塞。
5. **若该任务为 P0：停止，不要再选取其他任务。**
6. 若非 P0：按优先级继续下一件 TODO。

不要在移入 `blocked/` 时继续实现代码。若执行中途阻塞且已有改动：能回退则回退。不要因移入 `blocked/` 而自动 commit。

详细判定见 [references/REFERENCE.md](references/REFERENCE.md)。

---

## 执行与完成

对 `todo/` 中 Status 为 TODO、可执行且依赖已满足的任务，**一次只做一件**：

1. 移到 `doing/`，把 Status 改为 `DOING`。
2. 按 TASK 的 Context / Requirements / Constraints 实现。
3. 跑必要验证（测试、`pnpm lint:fix`、必要时 `pnpm typecheck`）。
4. 把 Status 设为 `DONE`，在 Agent Notes 填写完成说明。
5. 移到 `.agents/ap-config/work-data/tasks/done/`，文件名保持原样。
6. 按下方「完成后提交」创建 commit。
7. 再扫描 `todo/`，按优先级串行执行下一件 TODO。

---

## 完成后提交

每件从 `doing/` 移入 `done/` 成功后立刻创建 **一次** git commit，然后才可以开始下一件：

1. 并行查看 `git status`、`git diff`、`git log`（近期风格）。
2. 暂存本次任务相关改动（实现代码、移入 `done/` 的 TASK 文件、从 `doing/` 的移除）。不要暂存密钥、`.env`、凭证文件。
3. 按 Conventional Commits 写**中文**说明：祈使语气，最多 50 个字符，不加句号。优先带上任务编号。  
   例：`feat(auth): 完成 TASK-001 用户登录`
4. commit 后跑 `git status` 确认成功。
5. **禁止 push**（包括 `git push`、设 upstream、force push）。
6. 向用户报告本件的 commit 说明，然后按优先级继续下一件 TODO。

不要把多件任务的改动打进同一次 commit。不要在移入 `blocked/` 时自动 commit。

---

## 硬性约束

- 不要自行创造任务中没有提出的需求。
- **只执行 Status 为 TODO 的任务。** 不要执行 `DOING` / `PLAN` / `BLOCKED` / `DONE`。
- 开始执行必须先移入 `doing/` 并把 Status 改为 `DOING`。
- 未填写、文档不合格、或 Agent 无法处理时必须移入 `blocked/` 并改为 `BLOCKED`，不得猜着补全或执行。
- P0 一旦阻塞（`blocked/` 中已有或本轮刚移入），必须停止，不得继续其他任务。
- `doing/` 非空时不得领取新的 TODO。
- 不要修改、创建、删除 `.agents/ap-config/work-data/decisions/` 中的 ADR；需要新决策时写入 Agent Notes 并移入 `blocked/`。
- **不要读取、执行、改写 `plan/`。** 不要把任务改为 `PLAN`。
- 同一时刻最多实现一件任务；禁止并发；允许串行；选取必须按优先级。
- 移入 `done/` 后必须 commit；禁止 push。

---

## 附加资源

- 阻塞判定与路由：[references/REFERENCE.md](references/REFERENCE.md)
- 任务模板：`.agents/ap-config/work-data/tasks/task-template.md`
- 目录约定：`.agents/ap-config/work-data/README.md`
- 架构决策：`.agents/ap-config/work-data/decisions/`
