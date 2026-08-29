import { getApWebLaunchDir } from '@/ai/agents-root'

/**
 * 返回工作区根目录。
 *
 * 默认使用 `INIT_CWD`（用户敲命令时的目录），这样 `ap view` 能找到用户项目，
 * 而不是 npx/standalone 包自己的目录。
 *
 * @param startDir - 工作区根，默认 INIT_CWD 或 process.cwd()
 * @returns 仓库根绝对路径
 */
export function getWorkspaceRoot(startDir = getApWebLaunchDir()): string {
  return startDir
}
