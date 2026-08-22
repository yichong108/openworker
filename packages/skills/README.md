# @openworker/skills

OpenWorker 内置 Agent Skills 内容包。各技能位于 `content/` 下的独立子目录，入口文件为 `SKILL.md`。

仅识别文件名为 `SKILL.md` 的技能文档，并读取其 frontmatter 元数据。

## 最小结构

```text
packages/skills/
  content/
    bug-fix/
      SKILL.md
    code-review/
      SKILL.md
    feature-implement/
      SKILL.md
```

## Frontmatter 示例

```md
---
name: code_review
description: 用于执行代码评审，优先发现 bug、回归风险和缺失测试。
---
```

`name` 与 `description` 会被用于工具注册与匹配。

## 快速验证

1. 在 `content/` 下新建一个技能目录并写入 `SKILL.md`
2. 启动应用并向 Agent 提问（例如：`请按 code review 方式审查这次改动`）
3. 在时间线中确认是否出现对应 `skill_*` 工具调用

## 示例提问

- `请使用 bug fix 技能修复这个报错：...`
- `请按 code review 技能审查最近修改`
- `请用 feature implement 技能实现这个需求：...`

## 工具工作流技能化模板（推荐）

本仓库已提供以下模板：

- `content/debug-workflow/SKILL.md`：故障修复流程（复现 -> 定位 -> 修复 -> 验证）
- `content/release-workflow/SKILL.md`：发布流程（变更确认 -> 门禁 -> 发布 -> 回滚）
- `content/triage-workflow/SKILL.md`：分诊流程（收集 -> 评估 -> 排序 -> 执行清单）

### 典型触发语句

- `请按 debug workflow 处理这个报错`
- `请用 release workflow 给我一套发版检查和命令`
- `请按 triage workflow 对这些问题排优先级`

## 宿主如何定位内容

- **开发 / monorepo**：`packages/skills/content`
- **Desktop 安装包**：`process.resourcesPath/skills`（由 electron-builder `extraResources` 从 `content/` 复制）

Native 服务在 `@openworker/shared` 的 `resolveBundledSkillsContentDir()` 中按上述顺序解析；用户 skills 目录见 `getOpenworkerSkillsDir()`。
