import { type ChildProcess } from 'node:child_process'

import { ensureWorkspaceExists } from './path-guard.js'
import {
  createConsoleOutputDecoder,
  killChildProcess,
  spawnWorkspaceShell
} from './workspace-shell.js'

/**
 * shell 命令流式输出回调（如宿主右侧终端）。
 */
export type RunCommandHandlers = {
  /** 实时推送输出；提供时 resolve 仅返回尾部状态行，避免与流式重复 */
  onChunk?: (text: string, stream: 'stdout' | 'stderr') => void
}

/**
 * 按 sessionKey 跟踪宿主交互式终端子进程：执行、取消与运行态查询。
 *
 * 仅供宿主右侧栏等交互式终端使用；agent shell 工具不经过本类，各自 spawn 并监听 abort。
 */
export class TerminalManager {
  private readonly running = new Map<string, ChildProcess>()
  private readonly cancelledSessions = new Set<string>()

  /**
   * 在工作区根目录执行 shell 命令并等待结束（MVP：无 PTY；可流式推送）。
   *
   * @param sessionKey - 会话键，用于取消/互斥
   * @param workspace - 工作区根目录
   * @param command - 要执行的命令
   * @param handlers - 可选流式回调
   * @returns 合并 stdout/stderr（或流式模式下的状态后缀）
   */
  runCommand(
    sessionKey: string,
    workspace: string,
    command: string,
    handlers?: RunCommandHandlers
  ): Promise<string> {
    const cwd = ensureWorkspaceExists(workspace)
    const streaming = Boolean(handlers?.onChunk)
    return new Promise((resolve) => {
      const child = spawnWorkspaceShell(command, cwd)
      this.running.set(sessionKey, child)
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
      }
      child.stdout?.on('data', (chunk) => push(chunk, 'stdout'))
      child.stderr?.on('data', (chunk) => push(chunk, 'stderr'))
      const done = (code: number | null) => {
        const wasCancelled = this.cancelledSessions.delete(sessionKey)
        this.running.delete(sessionKey)
        const suffix = wasCancelled
          ? '\n[Command cancelled]'
          : code && code !== 0
            ? `\n[Exit code ${code}]`
            : ''
        finish(streaming ? suffix : out + suffix)
      }
      child.on('error', (err) => {
        this.running.delete(sessionKey)
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
  killCommand(sessionKey: string): Promise<void> {
    const c = this.running.get(sessionKey)
    if (!c) return Promise.resolve()
    this.cancelledSessions.add(sessionKey)
    return killChildProcess(c)
  }

  /**
   * 判断指定会话键是否有命令在跑。
   *
   * @param key - 会话键
   * @returns 是否在运行
   */
  isRunning(key: string): boolean {
    return this.running.has(key)
  }
}
