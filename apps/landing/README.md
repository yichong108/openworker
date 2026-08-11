# @openworker/landing

OpenWorker 落地页与文档站（Next.js 静态导出），面向终端用户介绍产品与用法。

## 内容结构

- **首页**：产品总述与能力说明
- **文档 `/docs`**：简介 / 安装 / 快速开始 / 功能 / 配置

文档正文在 `src/app/docs/markdown/`；侧边栏注册表在 `src/app/docs/page.tsx`。支持 `#introduction`、`#quick-start` 等 hash 深链。

## 开发

```bash
pnpm landing:dev
# 或
pnpm --filter @openworker/landing dev
```

## 构建

```bash
pnpm landing:build
```

产物目录：`apps/landing/dist`（`output: 'export'`）。

本地模拟 GitHub Pages 子路径：

```bash
BASE_PATH=/openworker NEXT_PUBLIC_BASE_PATH=/openworker pnpm --filter @openworker/landing build
```

## 部署（GitHub Pages）

工作流：`.github/workflows/deploy-landing.yml`

- 仓库：[yichong108/openworker](https://github.com/yichong108/openworker)
- 触发：`main` 上 `apps/landing/**` 等相关变更，或手动 `workflow_dispatch`
- 构建并上传静态产物，经 `actions/deploy-pages` 发布
- 站点地址：`https://yichong108.github.io/openworker/`

首次启用：

1. 仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**
2. 合并/推送本工作流后，在 **Actions** 中确认 `Deploy Landing` 成功
3. 打开 [https://yichong108.github.io/openworker/](https://yichong108.github.io/openworker/)
