# @openworker/cli

命令行宿主：从环境变量解析模型配置，经 `OpenWorkerAgent`（AG-UI）发起对话。

# 用法

## 开发（tsx，改完即跑）

```bash
cp apps/cli/.env.example apps/cli/.env
# 编辑 OPENWORKERER_API_KEY 等

pnpm cli:start -- "列出当前目录文件"
pnpm cli:start
pnpm cli:start -- -m ask -C ./some-workspace
```

## 打包后测试

```bash
pnpm cli:build
pnpm cli:start:dist -- --help
pnpm cli:start:dist -- "用一句话介绍你自己"
```

产物在 `apps/cli/dist/index.js`（ESM bundle；`@vscode/ripgrep` 仍走 node_modules）。
