/**
 * Native 侧 OpenWorker 用户目录路径（与 Desktop / agent 包约定一致）
 *
 * 数据根优先 `OPENWORKER_HOME`（Desktop 按渠道注入），否则回落 `~/.openworker`。
 */

import { homedir } from 'node:os'
import path from 'node:path'

/** prod 渠道默认目录名；非 Desktop 独立启动时使用 */
const OPENWORKER_DIR_NAME = '.openworker'

/**
 * 解析 OpenWorker 用户数据根绝对路径。
 *
 * @returns `OPENWORKER_HOME` 或 `~/.openworker`
 */
export function getOpenworkerDir(): string {
  const fromEnv = process.env.OPENWORKER_HOME?.trim()
  if (fromEnv) return fromEnv
  return path.join(homedir(), OPENWORKER_DIR_NAME)
}

/**
 * 解析用户 skills 扫描根目录。
 *
 * @returns `{OPENWORKER_HOME}/skills` 绝对路径
 */
export function getOpenworkerSkillsDir(): string {
  return path.join(getOpenworkerDir(), 'skills')
}

/**
 * 解析用户 MCP 配置文件路径。
 *
 * @returns `{OPENWORKER_HOME}/mcp.json` 绝对路径
 */
export function getOpenworkerMcpConfigPath(): string {
  return path.join(getOpenworkerDir(), 'mcp.json')
}
