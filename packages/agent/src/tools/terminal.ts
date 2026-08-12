import { type ChildProcess, spawn } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { TextDecoder } from 'node:util'

import { ensureWorkspaceExists } from './path-guard.js'

const running = new Map<string, ChildProcess>()
const cancelledSessions = new Set<string>()

function truncate(s: string, max: number): { text: string; truncated: boolean } {
  if (s.length <= max) return { text: s, truncated: false }
  return {
    text: s.slice(0, max) + `\n[Output truncated, original length ${s.length} characters]`,
    truncated: true
  }
}

/**
 * shell 命令流式输出回调（如宿主右侧终端）。
 */
export type RunCommandHandlers = {
  /** 实时推送输出；提供时 resolve 仅返回尾部状态行，避免与流式重复 */
  onChunk?: (text: string, stream: 'stdout' | 'stderr') => void
}

/**
 * 截去可能不完整的 UTF-8 尾部，避免按块解码时把跨 chunk 的多字节字符误判为非法。
 *
 * @param buf - 待拆分的字节
 * @returns complete 可安全解码的前缀；rest 需留到下一 chunk
 */
function splitIncompleteUtf8Tail(buf: Buffer): { complete: Buffer; rest: Buffer } {
  if (buf.length === 0) return { complete: buf, rest: Buffer.alloc(0) }
  const last = buf[buf.length - 1]!
  if (last < 0x80) return { complete: buf, rest: Buffer.alloc(0) }

  let i = buf.length - 1
  let cont = 0
  while (i >= 0 && cont < 3 && (buf[i]! & 0xc0) === 0x80) {
    cont += 1
    i -= 1
  }
  if (i < 0) return { complete: Buffer.alloc(0), rest: buf }

  const lead = buf[i]!
  const need =
    (lead & 0xe0) === 0xc0 ? 1 : (lead & 0xf0) === 0xe0 ? 2 : (lead & 0xf8) === 0xf0 ? 3 : -1
  if (need > 0 && cont < need) {
    return { complete: buf.subarray(0, i), rest: buf.subarray(i) }
  }
  return { complete: buf, rest: Buffer.alloc(0) }
}

/**
 * 判断缓冲区是否仅含 ASCII（无高位字节）。
 *
 * @param buf - 待检查字节
 */
function isAsciiOnly(buf: Buffer): boolean {
  for (let i = 0; i < buf.length; i += 1) {
    if (buf[i]! >= 0x80) return false
  }
  return true
}

/**
 * 创建控制台 stdout/stderr 流式解码器。
 *
 * Windows 管道输出常为系统 ANSI 代码页（中文为 GBK），直接 `toString('utf8')` 会乱码；
 * 优先按 UTF-8 解码，遇到非法序列再回退 GBK。ASCII 前缀不锁定编码，避免误判。
 *
 * @returns 将 Buffer chunk 转为字符串的函数
 */
function createConsoleOutputDecoder(): (chunk: Buffer) => string {
  if (process.platform !== 'win32') {
    const utf8 = new TextDecoder('utf-8')
    return (chunk) => utf8.decode(chunk, { stream: true })
  }

  let pending: Buffer = Buffer.alloc(0)
  let encoding: 'utf8' | 'gbk' | null = null
  let decoder: TextDecoder | null = null

  return (chunk: Buffer) => {
    const buf = pending.length > 0 ? Buffer.concat([pending, chunk]) : chunk
    pending = Buffer.alloc(0)

    if (encoding && decoder) {
      return decoder.decode(buf, { stream: true })
    }

    const { complete, rest } = splitIncompleteUtf8Tail(buf)
    if (complete.length === 0) {
      pending = Buffer.from(rest)
      return ''
    }

    if (isAsciiOnly(complete)) {
      pending = Buffer.from(rest)
      return complete.toString('utf8')
    }

    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(complete)
      encoding = 'utf8'
      decoder = new TextDecoder('utf-8')
      pending = Buffer.from(rest)
      return text
    } catch {
      encoding = 'gbk'
      decoder = new TextDecoder('gbk')
      return decoder.decode(Buffer.concat([complete, rest]), { stream: true })
    }
  }
}

/**
 * 为 Windows 子进程准备环境：引导 Python 等工具使用 UTF-8。
 */
function buildWorkspaceShellEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  if (process.platform === 'win32') {
    env.PYTHONIOENCODING = env.PYTHONIOENCODING || 'utf-8'
    env.PYTHONUTF8 = env.PYTHONUTF8 || '1'
    env.LANG = env.LANG || 'zh_CN.UTF-8'
  }
  return env
}

function spawnWorkspaceShell(command: string, cwd: string): ChildProcess {
  const env = buildWorkspaceShellEnv()
  if (process.platform === 'win32') {
    // 切换到 UTF-8 代码页，减轻 cmd 内建命令与多数控制台工具的中文乱码
    const wrapped = `chcp 65001>NUL && ${command}`
    return spawn(wrapped, {
      cwd,
      env,
      shell: true,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
  }
  return spawn('/bin/sh', ['-c', command], {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  })
}

/**
 * 在工作区根目录执行 shell 命令并等待结束（MVP：无 PTY；可流式推送）。
 *
 * @param sessionKey - 会话键，用于取消/互斥
 * @param workspace - 工作区根目录
 * @param command - 要执行的命令
 * @param maxOutputChars - 输出截断上限
 * @param handlers - 可选流式回调
 * @returns 合并 stdout/stderr（或流式模式下的状态后缀）
 */
export function runCommand(
  sessionKey: string,
  workspace: string,
  command: string,
  maxOutputChars: number,
  handlers?: RunCommandHandlers
): Promise<string> {
  const cwd = ensureWorkspaceExists(workspace)
  const streaming = Boolean(handlers?.onChunk)
  return new Promise((resolve) => {
    const child = spawnWorkspaceShell(command, cwd)
    running.set(sessionKey, child)
    let out = ''
    let settled = false
    const decodeStdout = createConsoleOutputDecoder()
    const decodeStderr = createConsoleOutputDecoder()
    const finish = (value: string) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const push = (chunk: Buffer, stream: 'stdout' | 'stderr') => {
      const text = stream === 'stdout' ? decodeStdout(chunk) : decodeStderr(chunk)
      if (!text) return
      out += text
      handlers?.onChunk?.(text, stream)
      if (out.length > maxOutputChars * 2) {
        out = out.slice(0, maxOutputChars * 2)
        child.stdout?.removeAllListeners('data')
        child.stderr?.removeAllListeners('data')
        void killCommand(sessionKey)
        const { text: truncated } = truncate(out, maxOutputChars)
        const msg = truncated + '\n[Process terminated due to excessive output]'
        finish(streaming ? '\n[Process terminated due to excessive output]' : msg)
      }
    }
    child.stdout?.on('data', (chunk) => push(chunk, 'stdout'))
    child.stderr?.on('data', (chunk) => push(chunk, 'stderr'))
    const done = (code: number | null) => {
      const wasCancelled = cancelledSessions.delete(sessionKey)
      running.delete(sessionKey)
      const { text } = truncate(out, maxOutputChars)
      const suffix = wasCancelled
        ? '\n[Command cancelled]'
        : code && code !== 0
          ? `\n[Exit code ${code}]`
          : ''
      finish(streaming ? suffix : text + suffix)
    }
    child.on('error', (err) => {
      running.delete(sessionKey)
      finish(`Child process error: ${err.message}`)
    })
    child.on('close', (code) => done(code === null ? -1 : code))
  })
}

/**
 * 终止 sessionKey 对应的正在运行命令。
 *
 * @param sessionKey - 与 runCommand 相同的会话键
 */
export function killCommand(sessionKey: string): Promise<void> {
  const c = running.get(sessionKey)
  if (!c) return Promise.resolve()
  cancelledSessions.add(sessionKey)
  return new Promise((resolve) => {
    c.once('close', () => resolve())
    const pid = c.pid
    if (process.platform === 'win32' && pid) {
      const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true
      })
      killer.on('error', () => {
        try {
          c.kill()
        } catch {
          /* ignore */
        }
      })
    } else {
      try {
        c.kill('SIGTERM')
      } catch {
        /* ignore */
      }
    }
    setTimeout(() => {
      if (!c.killed) {
        try {
          c.kill('SIGKILL')
        } catch {
          /* ignore */
        }
      }
    }, 3000)
  })
}

/**
 * 判断指定会话键是否有命令在跑。
 *
 * @param key - 会话键
 * @returns 是否在运行
 */
export function isRunning(key: string): boolean {
  return running.has(key)
}

function extractLastTokenRange(input: string): { start: number; token: string } {
  const s = input ?? ''
  let i = s.length - 1
  while (i >= 0 && /\s/.test(s[i] ?? '')) i -= 1
  if (i < 0) return { start: s.length, token: '' }
  let start = i
  while (start >= 0 && !/\s/.test(s[start] ?? '')) start -= 1
  const tokenStart = start + 1
  return { start: tokenStart, token: s.slice(tokenStart, i + 1) }
}

function isPathInsideWorkspace(workspaceRoot: string, targetPath: string): boolean {
  const rel = path.relative(workspaceRoot, targetPath)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/**
 * 为终端命令行提供基于工作区路径的补全（仅匹配最后一个 token）。
 *
 * @param workspace - 工作区根目录
 * @param commandLine - 当前命令行
 * @returns 补全候选
 */
export async function completeCommandInWorkspace(
  workspace: string,
  commandLine: string
): Promise<string[]> {
  const workspaceRoot = ensureWorkspaceExists(workspace)
  const { start, token } = extractLastTokenRange(commandLine)
  const tokenPrefix = commandLine.slice(0, start)
  const normalizedToken = token.replace(/[\\/]+/g, path.sep)
  const hasTrailingSep = /[\\/]$/.test(token)
  const basePart = hasTrailingSep ? normalizedToken : path.dirname(normalizedToken)
  const namePart = hasTrailingSep ? '' : path.basename(normalizedToken)
  const relativeBase =
    basePart === '.' || basePart === path.sep || !basePart ? '' : basePart.replace(/^[\\/]+/, '')
  const absBase = path.resolve(workspaceRoot, relativeBase || '.')
  if (!isPathInsideWorkspace(workspaceRoot, absBase)) return []
  const entries = await readdir(absBase, { withFileTypes: true })
  const lowerNeedle = namePart.toLowerCase()
  const matched = entries
    .filter((entry) => entry.name.toLowerCase().startsWith(lowerNeedle))
    .slice(0, 80)
    .map((entry) => {
      const rawPath = relativeBase ? path.join(relativeBase, entry.name) : entry.name
      const slashPath = rawPath.split(path.sep).join('/')
      return `${tokenPrefix}${slashPath}${entry.isDirectory() ? '/' : ''}`
    })
  return matched
}
