# @openworker/mcp

OpenWorker MCP 客户端：stdio 连接池、探测 / 预热，以及把 MCP 工具编成 Agent ToolSet。

## 安装

```bash
pnpm add @openworker/mcp
```

## 入口

```ts
import {
  McpManager,
  buildMcpTools,
  buildMcpToolsFromConfig,
  loadMcpServersFromConfig
} from '@openworker/mcp'
```

| 导出                       | 用途                                                            |
| -------------------------- | --------------------------------------------------------------- |
| `McpManager`               | 发现与连接池（`probe` / `warmup` / `dispose`）；实例各自一池    |
| `buildMcpTools`            | 用 `defineTool` 把 MCP 工具编成 Agent ToolSet（必传 `manager`） |
| `loadMcpServersFromConfig` | 读取 Cursor 或本应用形态的 `mcp.json`                           |

进程级单例由宿主（如 `@openworker/agent` 的 `getDefaultMcpManager`）持有，本包不提供。

## 构建与发布

```bash
pnpm --filter @openworker/mcp build
pnpm --filter @openworker/mcp publint
pnpm release:mcp
```
