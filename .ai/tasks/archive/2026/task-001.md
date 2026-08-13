# 修改设置（模型与密钥）弹窗

## Status

COMPLETED

<!--
可选状态：
- TODO
- ACTIVE
- PLAN
- BLOCKED
- COMPLETED
-->

## Priority

P1

<!--
可选优先级：
- P0：紧急 / 阻塞其他工作
- P1：重要
- P2：普通
- P3：低优先级
-->

## Dependencies

- None

<!--
填写依赖的 TASK：
- TASK-XXX
- TASK-XXX
-->

## Decision Needed

- None

<!--
仅当 Status 为 PLAN、文件位于 .ai/tasks/plan/ 时填写。
列出人必须拍板的问题，每条应能用一句话回答。
澄清完成后清空本段。
-->

## Context

<!--
说明为什么需要这个任务。
描述当前系统状态、问题或背景。
不要描述具体实现步骤。
-->

因为这个弹窗的UI还有一些展示，我需要调整的。

## Goal

<!--
明确这个任务最终要解决什么问题。
应该描述结果，而不是实现过程。
-->

- 修改文案：【设置（模型与密钥）】改为【设置】
- 修改接口地址的默认值或占位符文案：https://api.deepseek.com改成https://api.deepseek.com/v1

## Scope

### In Scope

-
-
-

### Out of Scope

-
-
-

<!--
明确允许做什么，以及明确不应该顺手做什么。
-->

## Requirements

-
-
-

<!--
描述必须满足的功能或行为要求。
-->

## Constraints

-
-
-

<!--
描述技术、架构、兼容性、安全性等限制。
例如：
- 不引入新的依赖
- 不修改现有 API
- 遵循 ADR-XXX
-->

## Acceptance Criteria

- [x] 设置弹窗标题为「设置」
- [x] 接口地址占位符为 `https://api.deepseek.com/v1`
- [x] DeepSeek 默认 `baseUrl` 为 `https://api.deepseek.com/v1`

<!--
什么条件全部满足后，任务才能算完成。
验收标准应该尽可能客观、可验证。
-->

## Related Decisions

- ADR-overview.md（仅 Desktop / packages 当前阶段开发，改动限于设置弹窗与共享默认配置）
  <!-- 任务完成后由 AI 填写 -->
  <!--
  相关架构决策：
- ADR-001-xxx.md
- ADR-002-xxx.md
  -->

## Completion

### Implementation

将设置弹窗标题从「设置（模型与密钥）」改为「设置」；接口地址 Input 占位符与 `defaultProviderProfiles.deepseek.baseUrl` 均改为 `https://api.deepseek.com/v1`。未改 `apps/cli`、`services/api` 中暂停开发的 `.env.example`。

### Tests

无针对设置弹窗的既有单测；本次为文案与默认值变更，未新增测试。

### Validation

- `pnpm lint:fix`：通过
- `pnpm --filter @openworker/shared typecheck`：通过
- `pnpm --filter @openworker/desktop typecheck`：通过

### Notes

已有用户若已持久化旧 `baseUrl`（无 `/v1`），打开弹窗仍会显示旧值；仅新建/未配置时使用新默认。
