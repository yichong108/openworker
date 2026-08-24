import { type ChildProcess, spawn } from 'node:child_process'
import { TextDecoder } from 'node:util'

import { ensureWorkspaceExists } from './path-guard.js'

/**
 * 截断过长的命令输出。
 *
 * @param s - 原始输出
 * @param max - 字符上限
 * @returns 截断后文本与是否发生截断
 */
export function truncateOutput(s: string, max: number): { text: string; truncated: boolean } {
  if (s.length <= max) return { text: s, truncated: false }
  return {
    text: s.slice(0, max) + `\n[Output truncated, original length ${s.length} characters]`,
    truncated: true
  }
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
export function createConsoleOutputDecoder(): (chunk: Buffer) => string {
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

/**
 * 在工作区根目录 spawn shell 命令（无 PTY）。
 *
 * @param command - 要执行的命令
 * @param cwd - 工作区根目录
 * @returns 子进程
 */
export function spawnWorkspaceShell(command: string, cwd: string): ChildProcess {
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
 * 终止工作区 shell 子进程（Windows 杀进程树，其它平台 SIGTERM 后 SIGKILL）。
 *
 * @param child - 要终止的子进程
 */
export function killChildProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode != null) return Promise.resolve()
  return new Promise((resolve) => {
    child.once('close', () => resolve())
    const pid = child.pid
    if (process.platform === 'win32' && pid) {
      const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true
      })
      killer.on('error', () => {
        try {
          child.kill()
        } catch {
          /* ignore */
        }
      })
    } else {
      try {
        child.kill('SIGTERM')
      } catch {
        /* ignore */
      }
    }
    setTimeout(() => {
      if (!child.killed && child.exitCode == null) {
        try {
          child.kill('SIGKILL')
        } catch {
          /* ignore */
        }
      }
    }, 3000)
  })
}

/**
 * 在工作区执行一条命令并等待结束；可选 abortSignal 只杀本次子进程。
 *
 * 供 agent shell 工具使用：每次调用独立 spawn，不登记 sessionKey。
 *
 * @param workspace - 工作区根目录
 * @param command - 要执行的命令
 * @param maxOutputChars - 输出截断上限
 * @param abortSignal - 取消信号；触发时终止本子进程
 * @returns 合并 stdout/stderr
 */
export function runWorkspaceCommandOnce(
  workspace: string,
  command: string,
  maxOutputChars: number,
  abortSignal?: AbortSignal
): Promise<string> {
  const cwd = ensureWorkspaceExists(workspace)
  return new Promise((resolve) => {
    const child = spawnWorkspaceShell(command, cwd)
    let out = ''
    let settled = false
    let cancelled = false
    const decodeStdout = createConsoleOutputDecoder()
    const decodeStderr = createConsoleOutputDecoder()

    const finish = (value: string) => {
      if (settled) return
      settled = true
      abortSignal?.removeEventListener('abort', onAbort)
      resolve(value)
    }

    const onAbort = () => {
      cancelled = true
      void killChildProcess(child)
    }

    if (abortSignal) {
      if (abortSignal.aborted) {
        onAbort()
      } else {
        abortSignal.addEventListener('abort', onAbort, { once: true })
      }
    }

    const push = (chunk: Buffer, stream: 'stdout' | 'stderr') => {
      const text = stream === 'stdout' ? decodeStdout(chunk) : decodeStderr(chunk)
      if (!text) return
      out += text
      if (out.length > maxOutputChars * 2) {
        out = out.slice(0, maxOutputChars * 2)
        child.stdout?.removeAllListeners('data')
        child.stderr?.removeAllListeners('data')
        void killChildProcess(child)
        const { text: truncated } = truncateOutput(out, maxOutputChars)
        finish(truncated + '\n[Process terminated due to excessive output]')
      }
    }

    child.stdout?.on('data', (chunk) => push(chunk, 'stdout'))
    child.stderr?.on('data', (chunk) => push(chunk, 'stderr'))
    child.on('error', (err) => {
      finish(`Child process error: ${err.message}`)
    })
    child.on('close', (code) => {
      const { text } = truncateOutput(out, maxOutputChars)
      const suffix = cancelled
        ? '\n[Command cancelled]'
        : code && code !== 0
          ? `\n[Exit code ${code}]`
          : ''
      finish(text + suffix)
    })
  })
}
