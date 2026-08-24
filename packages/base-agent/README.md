# @openworker/base-agent

OpenWorker 最小 ReAct Agent：循环调度 + 仅 `shell` 工具。不含 fs / grep / skills / MCP。

## 安装

```bash
pnpm add @openworker/base-agent
```

## 入口

```ts
import { createBaseAgent } from '@openworker/base-agent'
```

```ts
const agent = createBaseAgent({ cwd: process.cwd() })
await agent.send('hi', { provider: model, messages: history })
```

`send` 的 `tools` 传入时作为完整工具集（不再与内置 shell 合并）；未传则仅 `shell`。`messages` 中 `role: 'system'` 会抽出作为 system prompt，不进入会话轨迹。

| 导出              | 用途                             |
| ----------------- | -------------------------------- |
| `createBaseAgent` | 工厂：返回可 `send` 的最小 agent |
| `runReActLoop`    | ReAct 循环实现                   |
| `CoreMessage` 等  | 消息类型与辅助函数               |

依赖 `@openworker/llm` 与 `@openworker/tools`。

## 构建与发布

```bash
pnpm --filter @openworker/base-agent build
pnpm --filter @openworker/base-agent publint
pnpm release:base-agent
```
