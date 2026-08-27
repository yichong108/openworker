# OpenWorker

OpenWorker is your AI companion for everyday information processing, helping you make better choices.

## Preview

OpenWorker main UI

## Prerequisites

- [Node.js](https://nodejs.org/) **18+**
- [pnpm](https://pnpm.io/) **9**

## Install

```bash
pnpm install
```

## Development

### Run core apps in dev mode

```bash
pnpm dev
```

### AP Web task board

```bash
pnpm ap-web:dev
```

Opens at http://localhost:3010 . Columns map to `todo` / `doing` / `done` / `blocked` under `.agents/ap-config/work-data/tasks/`.

### AI Coding

See [.agents/AGENTS.md](.agents/AGENTS.md), [.agents/ap-config/work-data/README.md](.agents/ap-config/work-data/README.md), [skills/](apps/ap-cli/src/ap-config/skills/) . For example, running the `/ap-task-execute` skill to quickly get started with development.

## License

[MIT](LICENSE)
