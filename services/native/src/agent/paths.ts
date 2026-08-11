/**
 * Native 侧 OpenWorker 用户目录路径（与 Desktop / agent 包约定一致：`~/.openworker`）
 */

import { homedir } from 'node:os'
import path from 'node:path'

/** 用户主目录下的 `.openworker` 根目录名 */
const OPENWORKER_DIR_NAME = '.openworker'

/**
 * 解析用户主目录下的 `.openworker` 根目录绝对路径。
 *
 * @returns `~/.openworker` 绝对路径
 */
export function getOpenworkerDir(): string {
  return path.join(homedir(), OPENWORKER_DIR_NAME)
}

/**
 * 解析用户 skills 扫描根目录。
 *
 * @returns `~/.openworker/skills` 绝对路径
 */
export function getOpenworkerSkillsDir(): string {
  return path.join(getOpenworkerDir(), 'skills')
}

/**
 * 解析用户 MCP 配置文件路径。
 *
 * @returns `~/.openworker/mcp.json` 绝对路径
 */
export function getOpenworkerMcpConfigPath(): string {
  return path.join(getOpenworkerDir(), 'mcp.json')
}
