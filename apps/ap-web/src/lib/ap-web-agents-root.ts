import { join, resolve } from 'node:path'

/**
 * 解析用户敲命令时的工作目录。
 *
 * pnpm `--filter` 会在包目录里启动 Next，`process.cwd()` 变成 `apps/ap-web`。
 * `INIT_CWD` 才是敲 `pnpm ap-web:dev` 时的目录。未设置时回退 `process.cwd()`。
 *
 * @returns 绝对路径
 */
export function getApWebLaunchDir(): string {
  const initCwd = process.env.INIT_CWD?.trim()
  return resolve(initCwd && initCwd.length > 0 ? initCwd : process.cwd())
}

/**
 * ap-web 读写的 `.agents` 根目录（与任务、toolbox、文件监听共用）。
 *
 * 不向上查找仓库根。
 *
 * @returns `{launchDir}/.agents` 的绝对路径
 */
export function getApWebAgentsRoot(): string {
  return join(getApWebLaunchDir(), '.agents')
}
