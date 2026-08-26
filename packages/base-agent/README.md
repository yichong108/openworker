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

`send` 的 `tools` 未传时仅 `shell`；传入时默认与内置 shell 合并（`toolsMode: 'merge'`，同名后者覆盖）。需完全替换工具集时设置 `toolsMode: 'replace'`。`messages` 中 `role: 'system'` 会抽出作为 system prompt，不进入会话轨迹。

| 导出                | 用途                                                    |
| ------------------- | ------------------------------------------------------- |
| `createBaseAgent`   | 工厂：返回可 `send` 的最小 agent                        |
| `BaseAgentWithAGUI` | AG-UI 适配：将 `createBaseAgent` 桥接为 `AbstractAgent` |
| `runReActLoop`      | ReAct 循环实现                                          |
| `CoreMessage` 等    | 消息类型与辅助函数                                      |

依赖 `@openworker/llm`、`@openworker/tools`；使用 `BaseAgentWithAGUI` 时还需 `@ag-ui/client` 与 `rxjs`。

## BaseAgentWithAGUI

将 `createBaseAgent` 包装为 AG-UI `AbstractAgent`，`run(input)` 返回 `Observable<BaseEvent>`，可直接对接 CopilotKit / HttpAgent 或 `runAgent()` 客户端管线。

### 创建

```ts
import { BaseAgentWithAGUI } from '@openworker/base-agent'
import { openai } from '@ai-sdk/openai'

const agent = new BaseAgentWithAGUI({
  agentId: 'base',
  description: 'Minimal shell-only agent',
  baseAgent: { cwd: process.cwd() },
  runDefaults: { provider: openai('gpt-4o-mini') }
})
```

- `baseAgent`：传给 `createBaseAgent` 的配置（目前仅 `cwd`）。
- `runDefaults`：每轮 `send` 的默认参数（`provider`、`maxSteps`、`tools` 等）；不含流式回调，回调由适配器映射为 AG-UI 事件。

### 执行一轮

**方式一：`run()` + RxJS**

```ts
import { firstValueFrom, toArray } from 'rxjs'

const events = await firstValueFrom(
  agent
    .run({
      threadId: 'thread-1',
      runId: 'run-1',
      state: {},
      messages: [{ id: 'u1', role: 'user', content: '列出当前目录' }],
      tools: [],
      context: [],
      forwardedProps: {}
    })
    .pipe(toArray())
)
```

**方式二：`runAgent()`（推荐）**

```ts
await agent.runAgent({
  runId: 'run-1',
  tools: [],
  context: [],
  forwardedProps: {
    provider: openai('gpt-4o-mini'),
    abortController: new AbortController()
  }
})
```

`RunAgentInput.messages` 须含至少一条 user 消息；适配器会提取最后一条 user 文本作为本轮输入，此前消息转为 `CoreMessage` 历史。

### forwardedProps 注意事项

AG-UI 会对 `forwardedProps` 做 `structuredClone`。AI SDK 的 `LanguageModel`（内含函数）与 `AbortController` 不可克隆，`BaseAgentWithAGUI` 会在克隆前自动剥离并在本轮 run 中合并回 `send` 选项。因此 **`provider` 应经 `forwardedProps` 或 `runDefaults` 传入**，不要指望把它放进会被克隆的 state。

每轮参数优先级：`runDefaults` < 克隆前剥离的 extras < `RunAgentInput.forwardedProps`。

### 取消与克隆

```ts
agent.abortRun() // 中断当前 run

const fork = agent.clone() // 复制 agent 与 AG-UI 消息 / state
```

### 事件映射

适配器将 `createBaseAgent.send` 的回调翻译为 AG-UI 事件，典型序列：

`RUN_STARTED` → (`CUSTOM(openworker.text.delta|revoke)` | `CUSTOM(cursor.thinking)` | `TOOL_CALL_*`)_ → `TEXT*MESSAGE*_`→`RUN_FINISHED`|`RUN_ERROR`

- 运行中打字机预览走 `CUSTOM(openworker.text.delta)`，终稿写入 `TEXT_MESSAGE_CONTENT`。
- 工具步会 `revoke` 预览文本，避免过程叙述污染落盘消息。

### 消息转换

宿主组装 `RunAgentInput.messages` 或落盘时，可使用包内辅助函数：

```ts
import { aguiMessagesToCore, coreMessagesToAgui, extractUserTurn } from '@openworker/base-agent'

const { userText, history } = extractUserTurn(aguiMessages)
const core = aguiMessagesToCore(aguiMessages)
const agui = coreMessagesToAgui(coreMessages)
```

## 构建与发布

```bash
pnpm --filter @openworker/base-agent build
pnpm --filter @openworker/base-agent publint
pnpm release:base-agent
```
