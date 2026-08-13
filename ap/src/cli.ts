/**
 * ap 子命令解析与帮助文案。
 */

import { resolve } from 'node:path'

import { DEFAULT_AP_MODE, parseConversationMode, type ApConversationMode } from './env.js'
import { resolveAgentsSkill, skillShortName, type AgentsSkill } from './skills-fs.js'

/** 与 skill 目录名冲突时优先的内建命令 */
export const AP_RESERVED_COMMANDS = ['login', 'help', 'task-create', 'decision-create'] as const

/** 从模板创建 work-data 文件的内建命令 */
export type ApCreateCommand = 'task-create' | 'decision-create'

/** ap 子命令解析结果 */
export type ApCliCommand =
  | { command: 'help'; topic?: string }
  | { command: 'login' }
  | {
      command: 'task-create'
      /** 仓库工作区根目录 */
      cwd: string
      /** 文件名（可带或不带 .md）；省略则按时间戳命名 */
      name?: string
    }
  | {
      command: 'decision-create'
      /** 仓库工作区根目录 */
      cwd: string
      /** 文件名（可带或不带 .md）；省略则按时间戳命名 */
      name?: string
    }
  | {
      command: 'skill'
      /** `.agents/skills` 下的目录名 */
      skill: string
      /** 仓库工作区根目录（Agent 的 local.cwd） */
      cwd: string
      /** 模型 id，如 composer-2.5 */
      model: string
      /** Cursor SDK 对话模式，默认 agent */
      mode: ApConversationMode
      /** 用户补充指令（如 --task 或剩余参数） */
      extra?: string
    }
  | {
      command: 'ask'
      /** 用户原话（第一段不是 skill 名时整段当作提问） */
      query: string
      cwd: string
      model: string
      /** Cursor SDK 对话模式，默认 agent */
      mode: ApConversationMode
    }

/**
 * 打印 ap 顶层用法，并列出当前已发现的 skill。
 *
 * @param skills - `.agents/skills` 中已发现的 skill
 */
export function printHelp(skills: readonly AgentsSkill[] = []): void {
  const skillLines =
    skills.length === 0
      ? '  （未发现 `.agents/skills/*/SKILL.md`）'
      : skills
          .map((skill) => {
            const short = skillShortName(skill.name)
            const alias = short ? ` / ${short}` : ''
            const summary = skill.summary ? `    ${skill.summary}` : ''
            return `  ${skill.name}${alias}${summary}`
          })
          .join('\n')

  console.log(`ap — 用 Cursor SDK 本地 Agent 执行 .agents/skills 中的任意技能

用法:
  ap "<提问>"
  ap "<提问>" --skill <skill>
  ap <skill> [options] [extra...]
  ap task-create [--name <文件名>]
  ap decision-create [--name <文件名>]
  ap login
  ap help [skill]

第一段是已发现的 skill 名（ap- 开头的也可用短名，如 task-executor）则执行该 skill；
否则整段当作用户提问，由 Agent 根据提问从已发现的 skill 中选一个执行。
提问时可用 --skill 指定 skill（支持短名）。
--mode 是 Cursor SDK 对话模式：agent（默认，直接改代码）或 plan（先出方案）。

内建命令:
  login                浏览器登录 Cursor，写入 SDK 凭证（不执行任务）
  task-create          从模板创建任务到 tasks/active/（不调用 Agent）
  decision-create      从模板创建决策到 decisions/（不调用 Agent）
  help                 显示本帮助

已发现的 skill:
${skillLines}

示例:
  ap "帮我执行下一个任务"
  ap "帮我执行下一个任务" --skill task-executor
  ap task-executor --mode plan
  ap ap-task-executor
  ap task-executor
  ap ap-task-executor --task TASK-001
  ap ap-refactor
  ap refactor
  ap login
  ap task-create
  ap task-create --name 用户登录
  ap decision-create
  ap decision-create --name module-map

环境变量:
  CURSOR_API_KEY       Cursor API Key（也可用 ap login）
  CURSOR_MODEL         默认模型（composer-2.5）
  AP_MODE              默认 SDK 对话模式（agent 或 plan）
`)
}

/**
 * 打印某个 skill 的用法。
 *
 * @param skill - 已发现的 skill
 */
export function printSkillHelp(skill: AgentsSkill): void {
  const summary = skill.summary ? `\n${skill.summary}\n` : ''
  const short = skillShortName(skill.name)
  const aliasLine = short ? `\n短名：${short}（ap ${short} 与 ap ${skill.name} 等价）\n` : ''
  console.log(`ap ${skill.name} — 执行 .agents/skills/${skill.name}
${summary}${aliasLine}
用法:
  ap ${skill.name} [options] [extra...]${short ? `\n  ap ${short} [options] [extra...]` : ''}

选项:
  -h, --help           显示帮助
  -C, --cwd <path>     工作区根目录（默认仓库根目录）
  -m, --model <id>     模型 id（默认 CURSOR_MODEL 或 composer-2.5）
  --task <id>          补充指令（点名任务等，原样交给 skill）
  --skill <s>          指定 skill（提问时钉死，支持短名）
  --mode <agent|plan>  Cursor SDK 对话模式（默认 agent）

其余非选项参数也会作为补充指令传给 Agent。
skill 路径：${skill.dir}
`)
}

/**
 * 打印 task-create / decision-create 的用法。
 *
 * @param command - 创建类内建命令
 */
export function printCreateHelp(command: ApCreateCommand): void {
  if (command === 'task-create') {
    console.log(`ap task-create — 从模板创建任务文件

用法:
  ap task-create
  ap task-create --name <文件名>

选项:
  --name <文件名>      目标文件名（可省略 .md）
  -h, --help           显示帮助

未指定 --name 时，文件名为 task-YYYYMMDDHHmmSS.md。
写入 .agents/ap-config/work-data/tasks/active/，内容来自 task-template.md。
`)
    return
  }

  console.log(`ap decision-create — 从模板创建决策文件

用法:
  ap decision-create
  ap decision-create --name <文件名>

选项:
  --name <文件名>      目标文件名（可省略 .md）
  -h, --help           显示帮助

未指定 --name 时，文件名为 decision-YYYYMMDDHHmmSS.md。
写入 .agents/ap-config/work-data/decisions/，内容来自 decision-template.md。
`)
}

/**
 * 解析 skill 子命令的选项与补充指令。
 *
 * @param argv - 子命令之后的参数
 * @param defaults - cwd / model / mode 的默认值
 * @returns 解析后的选项；help 为 true 时调用方应打印帮助并退出；
 *   skill 来自 --skill；mode 来自 --mode
 */
export function parseSkillArgs(
  argv: string[],
  defaults: { cwd: string; model: string; mode: ApConversationMode }
):
  | { help: true }
  | {
      help: false
      cwd: string
      model: string
      mode: ApConversationMode
      extra?: string
      skill?: string
    } {
  let cwd = defaults.cwd
  let model = defaults.model
  let mode = defaults.mode
  let skill: string | undefined
  const extras: string[] = []
  let help = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === '-h' || arg === '--help') {
      help = true
      continue
    }
    if (arg === '-C' || arg === '--cwd') {
      const next = argv[++i]
      if (!next) throw new Error(`${arg} 需要路径参数`)
      cwd = resolve(next)
      continue
    }
    if (arg === '-m' || arg === '--model') {
      const next = argv[++i]
      if (!next) throw new Error(`${arg} 需要模型 id`)
      model = next
      continue
    }
    if (arg === '--mode') {
      const next = argv[++i]
      if (!next) throw new Error(`${arg} 需要 agent 或 plan`)
      mode = parseConversationMode(next)
      continue
    }
    if (arg === '--skill') {
      const next = argv[++i]
      if (!next) throw new Error(`${arg} 需要 skill 名`)
      if (skill && skill !== next) {
        throw new Error(`不能同时指定不同的 skill：${skill} 与 ${next}`)
      }
      skill = next
      continue
    }
    if (arg === '--task') {
      const next = argv[++i]
      if (!next) throw new Error(`${arg} 需要任务编号或文件名`)
      extras.push(`--task ${next}`)
      continue
    }
    if (arg.startsWith('-')) {
      throw new Error(`未知选项: ${arg}`)
    }
    extras.push(arg)
  }

  if (help) return { help: true }
  const extra = extras.join(' ').trim()
  return {
    help: false,
    cwd,
    model,
    mode,
    ...(extra ? { extra } : {}),
    ...(skill ? { skill } : {})
  }
}

/**
 * 解析 task-create / decision-create 的选项。
 *
 * @param argv - 子命令之后的参数
 * @param defaults - cwd 默认值
 * @returns 解析后的选项；help 为 true 时调用方应打印帮助并退出
 */
export function parseCreateArgs(
  argv: string[],
  defaults: { cwd: string }
): { help: true } | { help: false; cwd: string; name?: string } {
  let cwd = defaults.cwd
  let name: string | undefined
  let help = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === '-h' || arg === '--help') {
      help = true
      continue
    }
    if (arg === '-C' || arg === '--cwd') {
      const next = argv[++i]
      if (!next) throw new Error(`${arg} 需要路径参数`)
      cwd = resolve(next)
      continue
    }
    if (arg === '--name') {
      const next = argv[++i]
      if (!next) throw new Error(`${arg} 需要文件名`)
      name = next
      continue
    }
    if (arg.startsWith('-')) {
      throw new Error(`未知选项: ${arg}`)
    }
    throw new Error(`不接受额外参数: ${arg}`)
  }

  if (help) return { help: true }
  return { help: false, cwd, ...(name ? { name } : {}) }
}

/**
 * 解析 process.argv（跳过 node / 脚本路径）为 ap 子命令。
 *
 * 第一段是 login/help/task-create/decision-create 走内建命令；
 * 是已发现的 skill 名（含 ap- 短名）则执行该 skill；
 * 否则整段当作用户提问（ask）。提问可用 --skill 钉死 skill。
 * --mode 传给 Cursor SDK（agent | plan，默认 agent）。
 * 会丢掉单独的 `--`，兼容 pnpm 传入的参数分隔符。
 *
 * @param argv - 通常为 process.argv.slice(2)
 * @param defaults - cwd / model / mode / 已发现的 skills
 * @returns 解析后的命令
 */
export function parseArgs(
  argv: string[],
  defaults: {
    cwd: string
    model: string
    mode?: ApConversationMode
    skills: readonly AgentsSkill[]
  }
): ApCliCommand {
  const args = argv.filter((arg) => arg !== '--')
  const first = args[0]
  if (!first || first === 'help' || first === '-h' || first === '--help') {
    const topic = first === 'help' ? args[1] : undefined
    return { command: 'help', ...(topic ? { topic } : {}) }
  }

  if (first === 'login') {
    if (args.slice(1).some((a) => a === '-h' || a === '--help')) {
      return { command: 'help' }
    }
    if (args.length > 1) {
      throw new Error(`login 不接受额外参数: ${args.slice(1).join(' ')}`)
    }
    return { command: 'login' }
  }

  if (first === 'task-create' || first === 'decision-create') {
    const parsed = parseCreateArgs(args.slice(1), { cwd: defaults.cwd })
    if (parsed.help) {
      return { command: 'help', topic: first }
    }
    return {
      command: first,
      cwd: parsed.cwd,
      ...(parsed.name ? { name: parsed.name } : {})
    }
  }

  const argDefaults = {
    cwd: defaults.cwd,
    model: defaults.model,
    mode: defaults.mode ?? DEFAULT_AP_MODE
  }

  const matched = resolveAgentsSkill(defaults.skills, first)
  if (matched) {
    const parsed = parseSkillArgs(args.slice(1), argDefaults)
    if (parsed.help) {
      return { command: 'help', topic: matched.name }
    }
    if (parsed.skill) {
      const flagged = resolveAgentsSkill(defaults.skills, parsed.skill)
      if (!flagged) {
        throw new Error(`未知 skill: ${parsed.skill}`)
      }
      if (flagged.name !== matched.name) {
        throw new Error(`不能同时指定不同的 skill：${matched.name} 与 ${flagged.name}`)
      }
    }
    return {
      command: 'skill',
      skill: matched.name,
      cwd: parsed.cwd,
      model: parsed.model,
      mode: parsed.mode,
      ...(parsed.extra ? { extra: parsed.extra } : {})
    }
  }

  const parsed = parseSkillArgs(args, argDefaults)
  if (parsed.help) {
    return { command: 'help' }
  }
  if (parsed.skill) {
    const flagged = resolveAgentsSkill(defaults.skills, parsed.skill)
    if (!flagged) {
      throw new Error(`未知 skill: ${parsed.skill}`)
    }
    return {
      command: 'skill',
      skill: flagged.name,
      cwd: parsed.cwd,
      model: parsed.model,
      mode: parsed.mode,
      ...(parsed.extra ? { extra: parsed.extra } : {})
    }
  }
  if (!parsed.extra) {
    throw new Error('请提供提问内容，或指定 skill 名。运行 ap help 查看用法。')
  }
  return {
    command: 'ask',
    query: parsed.extra,
    cwd: parsed.cwd,
    model: parsed.model,
    mode: parsed.mode
  }
}
