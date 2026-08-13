# @openworker/uni-agent

统一 AG-UI Agent 门面。暴露 `UniAgent` 类（`extends AbstractAgent`）与简单问答 `ask`。内部委托 OpenWorker 后端；宿主不直接依赖 `@openworker/agent`。

## 使用

```ts
import { UniAgent, ask } from '@openworker/uni-agent'

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

Composer 模式（经 `composerMode`）：

- `build`：可写文件 / shell / skills / MCP
- `ask`：只读问答
- `plan`：只读调研并产出 `CUSTOM(openworker.plan)` 计划工件；用户批准后再用 `build` + `planMarkdown` 执行

```ts
const planProps = agent.buildRunForwardedProps({
  composerMode: 'plan',
  abortController,
  workspacePath: cwd,
  provider
})
await agent.runAgent({ runId: 'plan-1', forwardedProps: planProps })

const buildProps = agent.buildRunForwardedProps({
  composerMode: 'build',
  abortController,
  workspacePath: cwd,
  provider,
  planMarkdown: approvedMarkdown
})
await agent.runAgent({ runId: 'build-1', forwardedProps: buildProps })
```

简单问答（临时 UniAgent，一轮后返回纯文本）：

```ts
const answer = await ask('今天天气怎么样？', { provider })
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
