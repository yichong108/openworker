# @openworker/tools

OpenWorker Agent 内建工具：`defineTool`、工作区 fs / grep / shell / web_search、路径沙箱、交互式终端。

## 安装

```bash
pnpm add @openworker/tools
```

## 入口

| 导入                                 | 用途                                                      |
| ------------------------------------ | --------------------------------------------------------- |
| `@openworker/tools`                  | 完整工具集（含 `grep`，依赖 `@vscode/ripgrep`）           |
| `@openworker/tools/terminal-manager` | 仅 `TerminalManager`，避免把 ripgrep 打进 Electron 主进程 |

```ts
import { defineTool, buildFsTools, buildGrepTool, buildShellTool } from '@openworker/tools'
import { TerminalManager } from '@openworker/tools/terminal-manager'
```

## 构建与发布

```bash
pnpm --filter @openworker/tools build
pnpm --filter @openworker/tools publint
pnpm release:tools
```
