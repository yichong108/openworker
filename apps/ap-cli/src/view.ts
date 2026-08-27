/**
 * ap view：启动 @openworker/ap-web standalone 并打开浏览器。
 */

import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { getPackageRoot } from './env.js'

const execFileAsync = promisify(execFile)

const DEFAULT_PORT_MIN = 10_000
const DEFAULT_PORT_MAX = 10_099
const HEALTH_TIMEOUT_MS = 2_000
const READY_TIMEOUT_MS = 60_000
const READY_POLL_MS = 500

/** /api/health 响应 */
type ApWebHealth = {
  ok?: boolean
  launchDir?: string
}

/** runApView 入参 */
export type RunApViewInput = {
  /** 用户项目根（INIT_CWD） */
  cwd: string
  /** 显式端口；省略时自动分配 10000..10099 */
  port?: number
  /** 就绪后是否打开浏览器 */
  open: boolean
}

/**
 * 解析 AP_WEB_PORT_MIN / AP_WEB_PORT_MAX。
 */
function getPortRange(): { min: number; max: number } {
  const minRaw = process.env.AP_WEB_PORT_MIN?.trim()
  const maxRaw = process.env.AP_WEB_PORT_MAX?.trim()
  const min = minRaw ? Number.parseInt(minRaw, 10) : DEFAULT_PORT_MIN
  const max = maxRaw ? Number.parseInt(maxRaw, 10) : DEFAULT_PORT_MAX
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) {
    throw new Error(
      `无效端口范围：AP_WEB_PORT_MIN=${minRaw ?? DEFAULT_PORT_MIN} AP_WEB_PORT_MAX=${maxRaw ?? DEFAULT_PORT_MAX}`
    )
  }
  return { min, max }
}

/**
 * 比较两路径是否同一目录（Windows 忽略大小写）。
 */
function pathsEqual(a: string, b: string): boolean {
  const left = resolve(a)
  const right = resolve(b)
  if (process.platform === 'win32') {
    return left.toLowerCase() === right.toLowerCase()
  }
  return left === right
}

/**
 * 项目 ap-web 端口持久化文件路径。
 */
function getPortFilePath(cwd: string): string {
  return join(cwd, '.agents', 'ap-config', 'web-data', 'ap-web.port')
}

/**
 * 读取项目上次使用的端口。
 */
function readSavedPort(cwd: string): number | undefined {
  const filePath = getPortFilePath(cwd)
  if (!existsSync(filePath)) return undefined
  const value = Number.parseInt(readFileSync(filePath, 'utf8').trim(), 10)
  return Number.isFinite(value) ? value : undefined
}

/**
 * 写入项目端口文件。
 */
function writeSavedPort(cwd: string, port: number): void {
  const filePath = getPortFilePath(cwd)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, String(port), 'utf8')
}

/**
 * 请求 ap-web /api/health；无服务或超时返回 null。
 */
async function fetchHealth(port: number): Promise<ApWebHealth | null> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS)
    })
    if (!response.ok) return null
    return (await response.json()) as ApWebHealth
  } catch {
    return null
  }
}

/**
 * 判断端口上是否已是本项目的 ap-web。
 */
async function isProjectRunningOnPort(cwd: string, port: number): Promise<boolean> {
  const health = await fetchHealth(port)
  return Boolean(health?.ok && health.launchDir && pathsEqual(health.launchDir, cwd))
}

/**
 * 自动为本项目选取可用端口（10000..10099）。
 */
export async function resolvePortForProject(cwd: string): Promise<number> {
  const projectRoot = resolve(cwd)
  const { min, max } = getPortRange()
  const saved = readSavedPort(projectRoot)

  if (saved !== undefined && (await isProjectRunningOnPort(projectRoot, saved))) {
    return saved
  }

  for (let port = min; port <= max; port++) {
    const health = await fetchHealth(port)
    if (!health) {
      return port
    }
    if (health.ok && health.launchDir && pathsEqual(health.launchDir, projectRoot)) {
      return port
    }
  }

  throw new Error(
    `无可用端口（${min}..${max} 均已占用）。请关闭部分 ap-web、使用 --port，或调大 AP_WEB_PORT_MAX。`
  )
}

/**
 * 校验用户显式指定的端口是否可用。
 */
export async function resolveExplicitPort(cwd: string, port: number): Promise<number> {
  if (!Number.isFinite(port) || port <= 0 || port > 65_535) {
    throw new Error(`无效端口: ${port}`)
  }

  const projectRoot = resolve(cwd)
  const health = await fetchHealth(port)
  if (!health) {
    return port
  }
  if (health.ok && health.launchDir && pathsEqual(health.launchDir, projectRoot)) {
    return port
  }
  if (health.launchDir && !pathsEqual(health.launchDir, projectRoot)) {
    throw new Error(`端口 ${port} 已被其他项目的 ap-web 占用（${health.launchDir}）`)
  }
  throw new Error(`端口 ${port} 已被占用`)
}

/**
 * 把 CLI 自身 semver 转成同 minor 的 npm x-range。
 * 协议：ap-cli 与 ap-web 的 major.minor 对齐、patch 可不同 → 1.1.2 对应 1.1.x。
 */
function toMinorXRange(version: string): string {
  const match = /^(\d+)\.(\d+)\.\d+/.exec(version.trim())
  if (!match) {
    throw new Error(`无法从 CLI 版本推出 ap-web range：${version} 不是 x.y.z`)
  }
  return `${match[1]}.${match[2]}.x`
}

/**
 * 按 CLI 版本推出 ap-web 的 npm range，供 npx 取该 minor 下最新 patch。
 */
function resolveApWebVersionRange(): string {
  const pkgPath = join(getPackageRoot(), 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string }
  const version = pkg.version?.trim()
  if (!version) {
    throw new Error(`无法从 CLI 版本推出 ap-web range：${pkgPath} 缺少 version`)
  }
  return toMinorXRange(version)
}

/**
 * 解析 npx 可执行文件（Windows 为 npx.cmd）。
 */
function resolveNpxCommand(): string {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx'
}

/**
 * 通过 npx 启动 ap-web：-y 跳过安装确认，--ignore-existing 避免缓存卡住旧 patch。
 */
function spawnApWebServer(cwd: string, port: number): ChildProcess {
  const env = {
    ...process.env,
    INIT_CWD: resolve(cwd),
    PORT: String(port),
    HOSTNAME: process.env.HOSTNAME?.trim() || '127.0.0.1'
  }

  const version = resolveApWebVersionRange()
  process.stderr.write(`[ap view] 正在通过 npx 启动 @openworker/ap-web@${version}…\n`)
  return spawn(resolveNpxCommand(), ['-y', '--ignore-existing', `@openworker/ap-web@${version}`], {
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })
}

/**
 * 轮询 /api/health 直到本项目实例就绪。
 */
async function waitUntilReady(cwd: string, port: number): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS
  const projectRoot = resolve(cwd)

  while (Date.now() < deadline) {
    const health = await fetchHealth(port)
    if (health?.ok && health.launchDir && pathsEqual(health.launchDir, projectRoot)) {
      return
    }
    await new Promise((r) => setTimeout(r, READY_POLL_MS))
  }

  throw new Error(`等待 ap-web 就绪超时（${READY_TIMEOUT_MS / 1000}s）：http://127.0.0.1:${port}/`)
}

/**
 * 跨平台打开默认浏览器。
 */
async function openBrowser(url: string): Promise<void> {
  if (process.platform === 'win32') {
    await execFileAsync('cmd', ['/c', 'start', '', url], { windowsHide: true })
    return
  }
  if (process.platform === 'darwin') {
    await execFileAsync('open', [url])
    return
  }
  await execFileAsync('xdg-open', [url])
}

/**
 * 检测/启动 ap-web 看板；必要时打开浏览器并前台挂起直到子进程退出。
 */
export async function runApView(input: RunApViewInput): Promise<number> {
  const projectRoot = resolve(input.cwd)
  const port =
    input.port !== undefined
      ? await resolveExplicitPort(projectRoot, input.port)
      : await resolvePortForProject(projectRoot)

  if (await isProjectRunningOnPort(projectRoot, port)) {
    process.stderr.write(`[ap view] 已在运行 http://127.0.0.1:${port}/\n`)
    if (input.open) {
      await openBrowser(`http://127.0.0.1:${port}/`)
    }
    return 0
  }

  const child = spawnApWebServer(projectRoot, port)
  let spawnError: Error | undefined

  const onSignal = (): void => {
    if (!child.killed) {
      child.kill('SIGTERM')
    }
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
  child.on('error', (error) => {
    spawnError = error
  })

  try {
    await new Promise((r) => setTimeout(r, 200))
    if (spawnError) {
      throw spawnError
    }
    await waitUntilReady(projectRoot, port)
    writeSavedPort(projectRoot, port)
    process.stderr.write(`[ap view] http://127.0.0.1:${port}/ （INIT_CWD=${projectRoot}）\n`)
    if (input.open) {
      await openBrowser(`http://127.0.0.1:${port}/`)
    }

    const exitCode = await new Promise<number>((resolveExit, reject) => {
      child.on('error', reject)
      child.on('exit', (code, signal) => {
        if (signal) {
          resolveExit(130)
          return
        }
        resolveExit(code ?? 0)
      })
    })
    return exitCode
  } catch (error) {
    if (!child.killed) {
      child.kill('SIGTERM')
    }
    throw error
  } finally {
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
  }
}
