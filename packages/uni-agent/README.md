# @openworker/uni-agent

统一 AG-UI Agent 门面。

## 一句话

只暴露 `UniAgent` 类（`extends AbstractAgent`）。内部委托 OpenWorker 后端；宿主不直接依赖 `@openworker/agent`。

## 使用

```ts
import { UniAgent } from '@openworker/uni-agent'

const agent = new UniAgent({
  agentId: 'desktop-session',
  threadId: 'session-1',
  cwd: '/path/to/workspace'
})

agent.assertReady({ provider })
const forwardedProps = agent.buildRunForwardedProps({
  composerMode: 'build',
  abortController,
  workspacePath: cwd,
  provider
})
await agent.runAgent({ runId: 'r1', forwardedProps })
await agent.dispose()
```

MCP 宿主：

```ts
const mcpHost = new UniAgent({
  role: 'mcp-host',
  agentId: 'mcp-host'
})
await mcpHost.mcp.warmup()
await mcpHost.dispose()
```

## 边界

- AG-UI 入口：仅 `UniAgent`
- Desktop 等宿主：只依赖本包
- 终端 / 路径 / skills / `resolveChatModel` 为本包附带的宿主工具转发（非第二套 Agent API）
