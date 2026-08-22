import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { app } from 'electron'

import { mainLog } from '@/main/logger'

/** 启动后等待 /health 的最长时间（毫秒） */
const HEALTH_TIMEOUT_MS = 10_000

/** /health 轮询间隔（毫秒） */
const HEALTH_INTERVAL_MS = 200

/** 本进程 spawn 的 native 子进程；外部已运行时为 null */
let child: ChildProcess | null = null

/** 是否由本进程拉起（为 true 时退出才 kill） */
let spawnedByUs = false

/**
 * 解析 Native HTTP 监听端口
 *
 * 优先 `OPENWORKER_NATIVE_PORT`，其次 `PORT`。
 *
 * @returns 正整型端口号
 */
export function getNativePort(): number {
  const raw = process.env.OPENWORKER_NATIVE_PORT || process.env.PORT
  if (raw?.trim()) {
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
  }
  throw new Error('未设置 OPENWORKER_NATIVE_PORT 或 PORT，请检查渠道环境文件')
}

/**
 * 解析 Native 服务 base URL
 *
 * 优先 `OPENWORKER_NATIVE_BASE_URL`（去尾部斜杠），否则拼 `http://127.0.0.1:${port}`。
 *
 * @returns 不含尾部斜杠的 base URL
 */
export function getNativeBaseUrl(): string {
  const fromEnv = process.env.OPENWORKER_NATIVE_BASE_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/+$/, '') || `http://127.0.0.1:${getNativePort()}`
  return `http://127.0.0.1:${getNativePort()}`
}

/**
 * 是否使用 Electron 内嵌 Node（ELECTRON_RUN_AS_NODE）跑 native
 *
 * 安装包必须为 true；开发态默认 false，可用 `OPENWORKER_NATIVE_USE_ELECTRON_NODE=1` 强制开启以便冒烟。
 *
 * @returns true 时用 process.execPath + ELECTRON_RUN_AS_NODE
 */
function useElectronNode(): boolean {
  if (app.isPackaged) return true
  const flag = process.env.OPENWORKER_NATIVE_USE_ELECTRON_NODE?.trim().toLowerCase()
  return flag === '1' || flag === 'true'
}

/**
 * 解析 monorepo 中 `@openworker/native` 包根目录
 *
 * 兼容 electron-vite 开发（src/main）与构建后（out/main）：均相对向上两级到 apps/desktop，再定位 services/native。
 *
 * @returns native 包绝对路径
 */
function resolveNativePackageDir(): string {
  const mainDir = path.dirname(fileURLToPath(import.meta.url))
  const desktopDir = path.resolve(mainDir, '../..')
  return path.resolve(desktopDir, '../../services/native')
}

/**
 * 安装包内 native 入口（extraResources → resources/native/index.cjs）
 *
 * 使用 `.cjs` 避免仓库/`type:module` 祖先把入口当成 ESM，导致 CJS bundle 秒退。
 *
 * @returns 打包后入口绝对路径
 */
function resolvePackagedEntry(): string {
  return path.join(process.resourcesPath, 'native', 'index.cjs')
}

/**
 * 解析开发态可执行的 native 脚本路径（优先 desktop-bundle，其次 tsc dist）
 *
 * @returns 存在的入口文件路径，否则 null
 */
function resolveDevScriptEntry(): string | null {
  const nativeDir = resolveNativePackageDir()
  const candidates = [
    path.join(nativeDir, 'dist', 'desktop-bundle.cjs'),
    path.join(nativeDir, 'dist', 'index.js')
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

/**
 * 解析系统 Node 可执行文件
 *
 * 优先 pnpm/npm 注入的 `npm_node_execpath`，否则依赖 PATH 中的 `node`。
 *
 * @returns node 可执行路径或命令名
 */
function resolveSystemNodeBinary(): string {
  const fromNpm = process.env.npm_node_execpath?.trim()
  if (fromNpm && existsSync(fromNpm)) return fromNpm
  return 'node'
}

/**
 * 解析 tsx CLI，用于无 dist 时直接跑 TypeScript 源码
 *
 * @param nativeDir - native 包根目录
 * @returns tsx CLI 路径，找不到则 null
 */
function resolveTsxCli(nativeDir: string): string | null {
  const candidates = [
    path.join(nativeDir, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
    path.join(nativeDir, 'node_modules', 'tsx', 'dist', 'cli.js')
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

/**
 * 探测 Native `/health` 是否为 ok
 *
 * @param baseUrl - Native base URL
 * @returns status 为 ok 时 true
 */
async function probeHealth(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(1500)
    })
    if (!res.ok) return false
    const body = (await res.json()) as { status?: string }
    return body.status === 'ok'
  } catch {
    return false
  }
}

/**
 * 短暂休眠
 *
 * @param ms - 毫秒
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 开发态是否仅复用外部 Native（如 turbo 并行的 `native:dev`），不由 Desktop spawn。
 */
function useExternalNativeDev(): boolean {
  if (app.isPackaged) return false
  const flag = process.env.OPENWORKER_NATIVE_EXTERNAL?.trim().toLowerCase()
  return flag === '1' || flag === 'true'
}

/**
 * 轮询 `/health` 直至 deadline 或成功。
 *
 * @returns 是否在 deadline 前探活成功
 */
async function waitForHealthyNative(baseUrl: string, deadlineMs: number): Promise<boolean> {
  const deadline = Date.now() + deadlineMs
  while (Date.now() < deadline) {
    if (await probeHealth(baseUrl)) return true
    await sleep(HEALTH_INTERVAL_MS)
  }
  return false
}

/**
 * 将子进程 stdout/stderr 接到主进程日志
 *
 * @param proc - native 子进程
 */
function attachChildLogs(proc: ChildProcess): void {
  proc.stdout?.on('data', (buf: Buffer | string) => {
    const line = String(buf).trimEnd()
    if (line) mainLog.info(`[native] ${line}`)
  })
  proc.stderr?.on('data', (buf: Buffer | string) => {
    const line = String(buf).trimEnd()
    if (line) mainLog.warn(`[native] ${line}`)
  })
  proc.on('exit', (code, signal) => {
    mainLog.info(`[native] process exited code=${code} signal=${signal}`)
    if (child === proc) {
      child = null
      spawnedByUs = false
    }
  })
  proc.on('error', (error) => {
    mainLog.error('[native] spawn error', error)
    if (child === proc) {
      child = null
      spawnedByUs = false
    }
  })
}

/**
 * 组装 spawn 所需的 command / args / cwd / env
 *
 * @returns spawn 参数；无法解析入口时返回 null
 */
function resolveSpawnSpec(): {
  command: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
} | null {
  const port = String(getNativePort())
  const channel = process.env.APP_CHANNEL?.trim()
  if (!channel) {
    throw new Error('未设置 APP_CHANNEL，请检查渠道环境文件')
  }
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    APP_CHANNEL: channel,
    PORT: port,
    OPENWORKER_NATIVE_PORT: port
  }

  if (useElectronNode()) {
    const entry = app.isPackaged ? resolvePackagedEntry() : resolveDevScriptEntry()
    if (!entry || !existsSync(entry)) {
      mainLog.warn(`[native] entry missing for ELECTRON_RUN_AS_NODE: ${entry ?? '(none)'}`)
      return null
    }
    env.ELECTRON_RUN_AS_NODE = '1'
    if (app.isPackaged) {
      const rgName = process.platform === 'win32' ? 'rg.exe' : 'rg'
      const rgPath = path.join(process.resourcesPath, 'bin', rgName)
      if (existsSync(rgPath)) env.OPENWORKER_RG_PATH = rgPath
    }
    return {
      command: process.execPath,
      args: [entry],
      cwd: app.isPackaged ? path.dirname(entry) : resolveNativePackageDir(),
      env
    }
  }

  const nativeDir = resolveNativePackageDir()
  const script = resolveDevScriptEntry()
  if (script) {
    const rgName = process.platform === 'win32' ? 'rg.exe' : 'rg'
    const rgPath = path.join(nativeDir, 'dist', 'bin', rgName)
    if (existsSync(rgPath)) env.OPENWORKER_RG_PATH = rgPath
    return {
      command: resolveSystemNodeBinary(),
      args: [script],
      cwd: nativeDir,
      env
    }
  }

  const srcIndex = path.join(nativeDir, 'src', 'index.ts')
  const tsxCli = resolveTsxCli(nativeDir)
  if (existsSync(srcIndex) && tsxCli) {
    return {
      command: resolveSystemNodeBinary(),
      args: [tsxCli, srcIndex],
      cwd: nativeDir,
      env
    }
  }

  mainLog.warn(
    `[native] no runnable entry under ${nativeDir} (run pnpm native:build or ensure tsx)`
  )
  return null
}

/**
 * 启动（或复用）Native 本地服务
 *
 * 若 `/health` 已 ok 则复用外部实例且不 spawn；否则按开发/安装包策略拉起子进程并短时轮询探活。
 * 探活超时只打警告，不抛错，避免 native 异常拖垮整个 Desktop 启动。
 */
export async function startNativeService(): Promise<void> {
  const baseUrl = getNativeBaseUrl()

  if (await probeHealth(baseUrl)) {
    mainLog.info(`[native] already healthy at ${baseUrl}, reuse existing`)
    spawnedByUs = false
    return
  }

  if (useExternalNativeDev()) {
    const ready = await waitForHealthyNative(baseUrl, 30_000)
    if (ready) {
      mainLog.info(`[native] reuse external dev at ${baseUrl}`)
      spawnedByUs = false
      return
    }
    mainLog.warn(
      `[native] external native not ready at ${baseUrl}; ensure pnpm dev / native:dev is running`
    )
    return
  }

  // 未打包且非 external：短时等待后仍可由 Desktop 自行 spawn（仅跑 desktop:dev 时）
  if (!app.isPackaged) {
    const ready = await waitForHealthyNative(baseUrl, 8_000)
    if (ready) {
      mainLog.info(`[native] already healthy at ${baseUrl}, reuse existing`)
      spawnedByUs = false
      return
    }
  }

  const spec = resolveSpawnSpec()
  if (!spec) return

  mainLog.info(`[native] spawning: ${spec.command} ${spec.args.join(' ')}`)
  child = spawn(spec.command, spec.args, {
    cwd: spec.cwd,
    env: spec.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })
  spawnedByUs = true
  attachChildLogs(child)

  const deadline = Date.now() + HEALTH_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (await probeHealth(baseUrl)) {
      mainLog.info(`[native] ready at ${baseUrl}`)
      return
    }
    // 子进程已异常退出则不再空等
    if (child && (child.exitCode != null || child.signalCode != null)) {
      mainLog.warn(`[native] process exited before becoming healthy at ${baseUrl}`)
      return
    }
    await sleep(HEALTH_INTERVAL_MS)
  }

  mainLog.warn(`[native] health timeout after ${HEALTH_TIMEOUT_MS}ms at ${baseUrl}`)
}

/**
 * 停止本进程拉起的 Native 子进程
 *
 * 外部已运行的实例（复用）不会被杀死。Windows 使用 taskkill /T 结束进程树。
 */
export function stopNativeService(): void {
  if (!spawnedByUs || !child) {
    spawnedByUs = false
    child = null
    return
  }

  const proc = child
  const pid = proc.pid
  child = null
  spawnedByUs = false

  try {
    if (process.platform === 'win32' && pid) {
      spawn('taskkill', ['/pid', String(pid), '/f', '/t'], {
        stdio: 'ignore',
        windowsHide: true
      })
      return
    }
    proc.kill('SIGTERM')
  } catch (error) {
    mainLog.warn('[native] stop failed', error)
  }
}
