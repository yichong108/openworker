#!/usr/bin/env node
/**
 * ap 入口：按子命令分发（指定 skill / 用户提问 / login）。
 */

import { Cursor } from '@cursor/sdk'

import {
  parseArgs,
  printCreateHelp,
  printHelp,
  printInitHelp,
  printSkillHelp,
  printViewHelp
} from './cli.js'
import { createWorkDataFile } from './create-work-data.js'
import {
  findWorkspaceRoot,
  loadApEnv,
  readApiKeyFromEnv,
  resolveConversationMode,
  resolveModelId
} from './env.js'
import { installApWorkspace } from './install-skills.js'
import { loginCursorSdk, runApAsk, runApSkill } from './run.js'
import { findAgentsSkill, listAgentsSkills } from './skills-fs.js'
import { runApView } from './view.js'

/**
 * 确认已有 CURSOR_API_KEY 或 Cursor SDK 登录态，否则提示后退出。
 *
 * @returns 显式 API Key（若有）；未登录时返回 null 表示应中止
 */
async function requireCursorAuth(): Promise<string | undefined | null> {
  const apiKey = readApiKeyFromEnv()
  if (apiKey) return apiKey

  const status = await Cursor.auth.status()
  if (status.status === 'logged-in') return undefined

  console.error('未找到 CURSOR_API_KEY。请设置环境变量，或先运行：\n  ap login')
  return null
}

/**
 * CLI 主流程：发现 skill → 解析子命令 → 登录或执行。
 */
async function main(): Promise<void> {
  loadApEnv()

  const workspaceRoot = findWorkspaceRoot()
  const skills = listAgentsSkills(workspaceRoot)
  let command
  try {
    command = parseArgs(process.argv.slice(2), {
      cwd: workspaceRoot,
      model: resolveModelId(),
      mode: resolveConversationMode(),
      skills
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    printHelp(skills)
    process.exitCode = 1
    return
  }

  if (command.command === 'help') {
    if (command.topic === 'task-create' || command.topic === 'decision-create') {
      printCreateHelp(command.topic)
      return
    }
    if (command.topic === 'view') {
      printViewHelp()
      return
    }
    if (command.topic === 'init') {
      printInitHelp()
      return
    }
    if (command.topic) {
      const skill = findAgentsSkill(workspaceRoot, command.topic)
      if (!skill) {
        console.error(`未知 skill: ${command.topic}`)
        printHelp(skills)
        process.exitCode = 1
        return
      }
      printSkillHelp(skill)
    } else {
      printHelp(skills)
    }
    return
  }

  if (command.command === 'login') {
    await loginCursorSdk()
    return
  }

  if (command.command === 'init') {
    try {
      installApWorkspace(command.cwd)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[ap] ${message}`)
      process.exitCode = 1
    }
    return
  }

  if (command.command === 'view') {
    try {
      process.exitCode = await runApView({
        cwd: command.cwd,
        open: command.open,
        ...(command.port !== undefined ? { port: command.port } : {})
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(message)
      process.exitCode = 1
    }
    return
  }

  if (command.command === 'task-create' || command.command === 'decision-create') {
    try {
      const dest = createWorkDataFile({
        kind: command.command === 'task-create' ? 'task' : 'decision',
        cwd: command.cwd,
        ...(command.name ? { name: command.name } : {})
      })
      console.log(`已创建 ${dest}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(message)
      process.exitCode = 1
    }
    return
  }

  const apiKey = await requireCursorAuth()
  if (apiKey === null) {
    process.exitCode = 1
    return
  }

  if (command.command === 'ask') {
    if (skills.length === 0) {
      console.error('未发现 skill。请先运行：\n  ap init')
      process.exitCode = 1
      return
    }
    const code = await runApAsk({
      query: command.query,
      skills,
      cwd: command.cwd,
      model: command.model,
      mode: command.mode,
      ...(apiKey ? { apiKey } : {})
    })
    process.exitCode = code
    return
  }

  const code = await runApSkill({
    skill: command.skill,
    cwd: command.cwd,
    model: command.model,
    mode: command.mode,
    ...(apiKey ? { apiKey } : {}),
    ...(command.extra ? { extra: command.extra } : {})
  })
  process.exitCode = code
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[ap] ${message}`)
  process.exitCode = 1
})
