# 移除模块

## Status

COMPLETED

## Priority

P1

## Dependencies

- None

## Decision Needed

- None（决策已在任务启动前确认）

## Context

目前阶段不需要，留着有项目成本

## Goal

移除apps\admin,services\api,apps\cli,apps\phone,services\langfuse-local相关功能

## Scope

### In Scope

- 物理删除五个模块目录及 `packages/rag`、`scripts/rag`
- 清理根 `package.json` 脚本与 `pnpm dev` filter
- 更新 `.oxlintrc.json`、`.gitignore`、`overview.md`

### Out of Scope

- 修改其他 ADR 文件
- 更新 landing 文档内容

## Requirements

- 五个目标目录不存在
- 根脚本无对已移除模块的引用
- `pnpm lint:fix` 与 `pnpm typecheck` 通过

## Constraints

- 按 Decision Needed 中已确认的方案执行

## Acceptance Criteria

- [x] 上述五个目录不存在
- [x] `packages/rag` 已删除
- [x] 根 `package.json` 无 admin/api/cli/phone/langfuse/rag 脚本
- [x] `pnpm lint:fix` / `pnpm typecheck` 通过

## Related Decisions

- overview.md（已更新为「已移除」）

## Completion

### Implementation

- 物理删除 `apps/admin`、`apps/cli`、`apps/phone`、`services/api`、`services/langfuse-local`、`packages/rag`、`scripts/rag`
- 清理根 `package.json`：移除 `dev:prepare`、admin/api/cli/phone/langfuse/rag 脚本，简化 `dev` 与 `dev:all`
- 更新 `.oxlintrc.json`：移除 admin/phone/cli 相关 override
- 更新 `.gitignore`：移除 `services/api/data/`
- 更新 `overview.md`：暂停开发改为已移除

### Tests

- 未新增测试（删除性任务）

### Validation

- `pnpm install` 成功，lockfile 已更新
- `pnpm lint:fix` 通过
- `pnpm typecheck` 通过（10 packages）

### Notes

- `overview.md` 中路径修正为实际目录（services/api、services/langfuse-local）
