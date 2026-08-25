# OpenWorker 日志约定

本文说明 monorepo 内统一日志栈（`@openworker/log` + pino）的级别、环境变量、落盘路径与排查方式。

## 架构概览

| 组件                                 | 实现                           | 落盘                                                 |
| ------------------------------------ | ------------------------------ | ---------------------------------------------------- |
| **Native**（独立 `pnpm native:dev`） | pino + ALS                     | 见下方统一路径                                       |
| **Native**（被 Desktop spawn）       | stdout JSON → Desktop 解析     | 同上（pipe 模式下 Native 不写文件，由 Desktop 写入） |
| **Desktop main / renderer**          | pino + IPC                     | 同上                                                 |
| **packages**（skills/tools 等）      | `setLogger` 注入；默认 console | 随宿主                                               |

仅 **native / desktop** 在 `package.json` 中依赖 `@openworker/log`（private，不 release）。

## 统一落盘路径

**所有渠道、Native / Desktop 共用同一文件**，由 `getOpenworkerLogPath()` 定义：

```
{OPENWORKER_HOME}/logs/openworker.log
```

即 `getOpenworkerDir()` 下的 `logs/openworker.log`，与 SQLite 等同属用户数据根。

| 渠道 | 示例路径（Windows）                                  |
| ---- | ---------------------------------------------------- |
| dev  | `C:\Users\{you}\.openworker-dev\logs\openworker.log` |
| test | `~/.openworker-test/logs/openworker.log`             |
| prod | `~/.openworker/logs/openworker.log`                  |

启动时终端会打印该路径（Desktop 主进程、Native 独立运行均会输出）。

## 环境变量（`load-env.ts`）

| 变量                          | 默认                          | 说明                                                         |
| ----------------------------- | ----------------------------- | ------------------------------------------------------------ |
| `OPENWORKER_LOG_LEVEL`        | dev=`debug`，test/prod=`info` | 全局最低级别                                                 |
| `OPENWORKER_LOG_MODULES`      | 空                            | 按 module 细调，如 `native:agent:debug,@openworker/mcp:warn` |
| `OPENWORKER_NATIVE_PIPE_LOGS` | Desktop spawn 时设为 `1`      | Native 仅 stdout，由 Desktop 写入同一 `openworker.log`       |

```bash
OPENWORKER_LOG_LEVEL=debug pnpm native:dev
OPENWORKER_LOG_LEVEL=debug pnpm desktop:dev
```

## 日志级别

| 级别      | 用途                                                   |
| --------- | ------------------------------------------------------ |
| **error** | 失败、异常、需立即关注                                 |
| **warn**  | 可恢复异常、降级、跳过                                 |
| **info**  | 生命周期、请求摘要、agent 步骤摘要（不含 prompt 全文） |
| **debug** | 完整 prompt/messages、工具 args/result 详情            |

### 禁止事项

- Route / 业务代码中直接 `console.*`
- **info** 级打印完整 LLM prompt 或 API key
- 将 settings `JSON.stringify` 后期望自动脱敏（redact 只处理结构化字段）

## 关联字段（排查 session）

- `module` — 如 `native:agent`、`@openworker/tools`、`desktop:main`
- `sessionId` / `workspaceId` / `requestId`

```bash
grep "sessionId" ~/.openworker-dev/logs/openworker.log
```

## 敏感字段脱敏

pino `redact` 对结构化字段（`apiKey`、`tavilyApiKey` 等）输出 `[Redacted]`，不对字符串全文搜索。

## 宿主注入 packages logger

Native 在 `bootstrap-log.ts` 中 `setLogger(createLogger(...))`；npm 单独安装 packages 时仍用默认 console。
