# @openworker/memory

单会话上下文压缩 + 用户画像（纯函数）。输入 AG-UI `Message[]` / 画像 facts，输出尾部原文窗口、压缩摘要、画像段落与可拼进 system 的文本。

**无 I/O**：不读数据库、不感知 `sessionId` / `userId`、不持久化。持久化与编排由宿主完成。

## 安装

workspace 包，Desktop 依赖：

```json
"@openworker/memory": "workspace:*"
```

## 会话压缩 API

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
```

LLM 精炼（宿主注入 `Summarizer`；建议温度 `DEFAULT_REFINE_TEMPERATURE = 0.7`）：

```ts
const summary = await refineSessionSummary({
  summary: result.summary,
  pinned: result.pinned,
  summarizer: { summarize: async ({ prompt, maxChars }) => ... }
})
```

## 用户画像 API

```ts
import {
  extractProfileFacts,
  mergeProfileFacts,
  formatProfileSection,
  composeMemorySystemSection
} from '@openworker/memory'

const incoming = await extractProfileFacts({ messages, prior, summarizer })
const profile = mergeProfileFacts(prior, incoming)
const profileSection = formatProfileSection(profile)
const systemSection = composeMemorySystemSection({
  profileSection,
  sessionSection: result.systemSection
})
```

事实 key 命名空间：`preference.*` | `identity.*` | `project.*` | `workflow.*`。

## Desktop 粘合层

对接点：[`apps/desktop/src/main/agent/memory.ts`](../../apps/desktop/src/main/agent/memory.ts)

- 会话：默认 **W=256k**；有新压缩内容时 **refine 默认开（T=0.7）**
- 画像：发消息前 `GET /me/profile` 注入；OpenWorker 一轮成功后 LLM 抽取并 `PUT /me/profile`
- Cursor 路径跳过（SDK 自管上下文）

## 设计边界

- 做：单会话压缩、用户画像抽取/合并/格式化
- 不做：近一周摘要、包内 Store/HTTP
