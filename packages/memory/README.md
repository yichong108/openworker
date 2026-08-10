# @openworker/memory

单会话上下文压缩（纯函数）。输入 AG-UI `Message[]` 与可选先验工作记忆，输出尾部原文窗口、压缩摘要与可拼进 system 的段落。

**无 I/O**：不读数据库、不感知 `sessionId`、不持久化。持久化与编排由宿主完成。

## 安装

workspace 包，Desktop 依赖：

```json
"@openworker/memory": "workspace:*"
```

## API

```ts
import {
  compactSessionHistory,
  refineSessionSummary,
  DEFAULT_SESSION_BUDGET
} from '@openworker/memory'

const result = compactSessionHistory({
  messages, // AG-UI Message[]
  prior: { summary, pinned },
  budget: { recentChars: 256_000, summaryChars: 4_000 } // 默认 W=256k
})

// result.recentMessages  — 喂给模型的尾部原文
// result.systemSection   — 拼进 system prompt
// result.summary/pinned  — 回灌为下次 prior
```

LLM 精炼（宿主注入 `Summarizer`；建议温度 `DEFAULT_REFINE_TEMPERATURE = 0.7`）：

```ts
const summary = await refineSessionSummary({
  summary: result.summary,
  pinned: result.pinned,
  summarizer: { summarize: async ({ prompt, maxChars }) => ... }
})
```

## Desktop 粘合层

对接点：[`apps/desktop/src/main/agent/memory.ts`](../../apps/desktop/src/main/agent/memory.ts)

- 默认预算 **W=256k**（`recentChars`）
- **refine 默认开启**：有新压缩内容时用当前对话模型精炼，**T=0.7**
- 可由 `prepareSessionMemory({ refine: false })` 关闭
- Cursor 路径跳过（SDK 自管上下文）

## 设计边界

- 本期：单会话压缩
- 不做：用户画像、近一周摘要、包内 Store
