# @openworker/llm

OpenWorker LLM 调用层：OpenAI 兼容聊天模型工厂，以及封装 AI SDK `streamText` 的单步流式接口。

## 安装

```bash
pnpm add @openworker/llm
```

## 入口

```ts
import { getChatModel, streamChatStep, toToolDeclarations } from '@openworker/llm'
```

| 导出                 | 用途                                                       |
| -------------------- | ---------------------------------------------------------- |
| `getChatModel`       | 按 apiKey / baseURL / model 创建 OpenAI 兼容 LanguageModel |
| `streamChatStep`     | 单步流式推理（不自动执行 tools）                           |
| `toToolDeclarations` | 去掉 ToolSet 的 execute，避免 SDK 自动跑工具               |

## 构建与发布

```bash
pnpm --filter @openworker/llm build
pnpm --filter @openworker/llm publint
pnpm release:llm
```
