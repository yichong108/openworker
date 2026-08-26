# @openworker/agent

通用产品能力 Agent：工作区工具、composerMode、plan 工件。不含 MCP、不含 AG-UI。

## 入口

```ts
import { createAgent } from '@openworker/agent'

const agent = createAgent({
  provider: model,
  local: { cwd: '/path/to/workspace' },
  resolveCapabilities: async ({ composerMode, workspaceRoot, onTool }) => ({
    tools: {},
    promptExtras: {}
  })
})
await agent.send('hi', { composerMode: 'build' })
```

工作区根须由 `local.cwd` 或 `send({ workspacePath })` 显式传入。额外工具与 prompt 经 `resolveCapabilities` 注入。
