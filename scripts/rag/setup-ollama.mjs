#!/usr/bin/env node
/**
 * 跨平台安装 Ollama、拉取 embedding 模型，并写入 services/api/.env
 *
 * 用法：pnpm rag:setup-ollama
 *
 * 策略：无论如何优先从中国国内镜像下载安装包/二进制，海外源仅作最后回退。
 *
 * 可选环境变量：
 * - OLLAMA_SETUP_URL：Windows 安装包直链（覆盖默认镜像列表）
 * - OLLAMA_SETUP_MIRROR：Unix 二进制下载前缀（替换 install.sh 中的 ollama.com/download）
 */

import { spawn, spawnSync } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { copyFile, mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')
const API_DIR = path.join(REPO_ROOT, 'services', 'api')
const ENV_PATH = path.join(API_DIR, '.env')
const ENV_EXAMPLE_PATH = path.join(API_DIR, '.env.example')

const OLLAMA_HOST = 'http://127.0.0.1:11434'
const EMBED_MODEL = 'nomic-embed-text'

/** GitHub Release 上的 Windows 安装包路径 */
const GITHUB_WINDOWS_INSTALLER =
  'https://github.com/ollama/ollama/releases/latest/download/OllamaSetup.exe'

/** 仅国内/加速源（始终优先，不含官方海外直连） */
const WINDOWS_INSTALLER_CN_URLS = [
  'https://cnb.cool/hex/ollama/-/releases/latest/download/OllamaSetup.exe',
  `https://ghproxy.cn/${GITHUB_WINDOWS_INSTALLER}`,
  `https://mirror.ghproxy.com/${GITHUB_WINDOWS_INSTALLER}`,
  `https://ghfast.top/${GITHUB_WINDOWS_INSTALLER}`,
  `https://gitdl.cn/${GITHUB_WINDOWS_INSTALLER}`
]

/** 海外官方源（国内全部失败后才用） */
const WINDOWS_INSTALLER_OVERSEAS_URLS = [
  'https://ollama.com/download/OllamaSetup.exe',
  GITHUB_WINDOWS_INSTALLER
]

/**
 * Windows 安装包 URL 列表：国内优先；可用 OLLAMA_SETUP_URL 覆盖
 *
 * @returns {string[]}
 */
function windowsInstallerUrls() {
  if (process.env.OLLAMA_SETUP_URL?.trim()) {
    return [process.env.OLLAMA_SETUP_URL.trim()]
  }
  return [...WINDOWS_INSTALLER_CN_URLS, ...WINDOWS_INSTALLER_OVERSEAS_URLS]
}

/** Unix 二进制下载前缀：国内代理优先，官方最后 */
const UNIX_BINARY_MIRRORS_CN = [
  'https://ghproxy.cn/https://github.com/ollama/ollama/releases/latest/download',
  'https://mirror.ghproxy.com/https://github.com/ollama/ollama/releases/latest/download',
  'https://ghfast.top/https://github.com/ollama/ollama/releases/latest/download',
  'https://gitdl.cn/https://github.com/ollama/ollama/releases/latest/download'
]

const ENV_KEYS = {
  RAG_EMBEDDING_PROVIDER: 'ollama',
  RAG_OLLAMA_BASE_URL: OLLAMA_HOST,
  RAG_OLLAMA_EMBED_MODEL: EMBED_MODEL
}

/**
 * 打印带前缀的日志
 *
 * @param {string} message
 */
function log(message) {
  console.log(`[rag:setup-ollama] ${message}`)
}

/**
 * 检测 PATH 中是否存在 ollama
 *
 * @returns {boolean}
 */
function hasOllamaCli() {
  const result = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['ollama'], {
    encoding: 'utf8',
    shell: process.platform === 'win32'
  })
  return result.status === 0
}

/**
 * 运行命令并继承 stdio；失败时抛错
 *
 * @param {string} command
 * @param {string[]} args
 * @param {{ shell?: boolean, env?: NodeJS.ProcessEnv }} [options]
 * @returns {Promise<void>}
 */
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: options.shell ?? process.platform === 'win32',
      env: options.env ?? process.env
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
    })
  })
}

/**
 * 探测 Ollama HTTP 是否可用
 *
 * @returns {Promise<boolean>}
 */
async function isOllamaUp() {
  try {
    const res = await fetch(OLLAMA_HOST, { signal: AbortSignal.timeout(2000) })
    return res.ok || res.status === 200
  } catch {
    return false
  }
}

/**
 * 轮询等待 Ollama 服务就绪
 *
 * @param {number} timeoutMs
 * @returns {Promise<void>}
 */
async function waitForOllama(timeoutMs = 120_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await isOllamaUp()) return
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error(
    `Ollama 未在 ${timeoutMs / 1000}s 内就绪。请手动启动 Ollama Desktop 或执行 ollama serve 后重试。`
  )
}

/**
 * 格式化字节数为可读大小
 *
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * 在同一行刷新下载进度
 *
 * @param {number} received
 * @param {number} total - 未知总长时为 0
 */
function renderDownloadProgress(received, total) {
  const receivedLabel = formatBytes(received)
  let line
  if (total > 0) {
    const pct = Math.min(100, (received / total) * 100)
    const width = 24
    const filled = Math.round((pct / 100) * width)
    const bar = `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`
    line = `[rag:setup-ollama] 下载中 ${bar} ${pct.toFixed(1)}% (${receivedLabel}/${formatBytes(total)})`
  } else {
    line = `[rag:setup-ollama] 下载中 ${receivedLabel}（总大小未知）`
  }
  process.stdout.write(`\r${line.padEnd(80)}`)
}

/**
 * 流式下载单个 URL 到本地，并打印进度
 *
 * @param {string} url
 * @param {string} destPath
 * @returns {Promise<number>} 已写入字节数
 */
async function downloadWithProgress(url, destPath) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 600_000)
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal
    })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    if (!res.body) {
      throw new Error('响应无 body')
    }

    const total = Number(res.headers.get('content-length') ?? 0)
    let received = 0
    let lastPaint = 0

    const nodeBody = Readable.fromWeb(
      /** @type {import('node:stream/web').ReadableStream} */ (res.body)
    )
    nodeBody.on('data', (chunk) => {
      received += chunk.length
      const now = Date.now()
      if (now - lastPaint >= 200 || (total > 0 && received >= total)) {
        lastPaint = now
        renderDownloadProgress(received, total)
      }
    })

    await pipeline(nodeBody, createWriteStream(destPath))
    process.stdout.write('\n')

    if (received < 1_000_000) {
      throw new Error(`文件过小（${received} bytes），可能不是安装包`)
    }
    return received
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * 按候选 URL 依次下载文件，国内镜像优先；显示进度
 *
 * @param {string[]} urls
 * @param {string} destPath
 * @returns {Promise<string>} 成功使用的 URL
 */
async function downloadFirstAvailable(urls, destPath) {
  /** @type {Error | null} */
  let lastError = null
  for (const url of urls) {
    log(`尝试下载：${url}`)
    try {
      const size = await downloadWithProgress(url, destPath)
      log(`下载完成（${formatBytes(size)}）：${url}`)
      return url
    } catch (err) {
      process.stdout.write('\n')
      lastError = err instanceof Error ? err : new Error(String(err))
      log(`失败：${lastError.message}`)
      await unlink(destPath).catch(() => undefined)
    }
  }
  throw new Error(`所有镜像均下载失败：${lastError?.message ?? 'unknown'}`)
}

/**
 * Windows：始终先从国内镜像下载安装包，全部失败后再试海外源；最后才 winget
 *
 * @returns {Promise<void>}
 */
async function installWindows() {
  const tmpDir = path.join(REPO_ROOT, 'node_modules', '.cache', 'rag-ollama')
  await mkdir(tmpDir, { recursive: true })
  const installerPath = path.join(tmpDir, 'OllamaSetup.exe')

  log('优先从中国国内镜像下载 OllamaSetup.exe…')
  try {
    await downloadFirstAvailable(windowsInstallerUrls(), installerPath)
    log('启动安装程序（可能需要 UI 确认）…')
    await run(installerPath, [], { shell: false })
    return
  } catch (err) {
    log(`镜像下载/安装失败：${err instanceof Error ? err.message : String(err)}`)
  }

  log('回退尝试 winget…')
  await run('winget', [
    'install',
    '-e',
    '--id',
    'Ollama.Ollama',
    '--accept-package-agreements',
    '--accept-source-agreements'
  ])
}

/**
 * macOS / Linux：脚本与二进制均优先国内代理，海外官方最后回退
 *
 * @returns {Promise<void>}
 */
async function installUnix() {
  /** @type {Array<{ shUrl: string, mirror: string }>} */
  const attempts = []

  // 用户指定镜像最先
  if (process.env.OLLAMA_SETUP_MIRROR?.trim()) {
    const mirror = process.env.OLLAMA_SETUP_MIRROR.trim()
    attempts.push({
      shUrl:
        'https://ghproxy.cn/https://raw.githubusercontent.com/ollama/ollama/main/scripts/install.sh',
      mirror
    })
  }

  // 国内：脚本代理 × 二进制代理
  for (const mirror of UNIX_BINARY_MIRRORS_CN) {
    attempts.push({
      shUrl:
        'https://ghproxy.cn/https://raw.githubusercontent.com/ollama/ollama/main/scripts/install.sh',
      mirror
    })
    attempts.push({
      shUrl:
        'https://ghfast.top/https://raw.githubusercontent.com/ollama/ollama/main/scripts/install.sh',
      mirror
    })
  }

  // 海外回退（最后）
  attempts.push({
    shUrl: 'https://ollama.com/install.sh',
    mirror: 'https://ollama.com/download'
  })

  /** @type {Error | null} */
  let lastError = null
  const seen = new Set()
  for (const { shUrl, mirror } of attempts) {
    const key = `${shUrl}|${mirror}`
    if (seen.has(key)) continue
    seen.add(key)
    log(`安装（脚本：${shUrl}，二进制镜像：${mirror}）…`)
    const script = `curl -fsSL "${shUrl}" | sed "s|https://ollama.com/download|${mirror}|g" | sh`
    try {
      await run('sh', ['-c', script], { shell: false })
      return
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      log(`失败：${lastError.message}`)
    }
  }
  throw new Error(`Unix 安装失败：${lastError?.message ?? 'unknown'}`)
}

/**
 * 确保 Ollama CLI 已安装
 *
 * @returns {Promise<void>}
 */
async function ensureOllamaInstalled() {
  if (hasOllamaCli()) {
    log('已检测到 ollama CLI，跳过安装')
    return
  }
  if (process.platform === 'win32') {
    await installWindows()
  } else if (process.platform === 'darwin' || process.platform === 'linux') {
    await installUnix()
  } else {
    throw new Error(`不支持的平台：${process.platform}，请手动安装 https://ollama.com`)
  }
  if (!hasOllamaCli()) {
    log('安装后 PATH 中仍无 ollama；若刚装完请打开新终端，或确认已加入 PATH')
  }
}

/**
 * 拉取 embedding 模型
 *
 * @returns {Promise<void>}
 */
async function pullModel() {
  log(`拉取模型 ${EMBED_MODEL}…`)
  await run('ollama', ['pull', EMBED_MODEL])
}

/**
 * 解析 .env 文本为键值（保留注释与空行顺序的 upsert）
 *
 * @param {string} content
 * @param {Record<string, string>} updates
 * @returns {string}
 */
function upsertEnvContent(content, updates) {
  const lines = content.length > 0 ? content.replace(/\r\n/g, '\n').split('\n') : []
  const seen = new Set()
  const out = lines.map((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)
    if (!match) return line
    const key = match[1]
    if (!(key in updates)) return line
    seen.add(key)
    return `${key}=${updates[key]}`
  })
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) out.push(`${key}=${value}`)
  }
  let text = out.join('\n')
  if (!text.endsWith('\n')) text += '\n'
  return text
}

/**
 * 写入 services/api/.env，并同步 .env.example 中的 RAG embedding 示例
 *
 * @returns {Promise<void>}
 */
async function writeEnvFiles() {
  await mkdir(API_DIR, { recursive: true })
  try {
    await readFile(ENV_PATH, 'utf8')
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') {
      try {
        await copyFile(ENV_EXAMPLE_PATH, ENV_PATH)
        log(`已从 .env.example 复制生成 ${ENV_PATH}`)
      } catch {
        await writeFile(ENV_PATH, '', 'utf8')
        log(`已新建 ${ENV_PATH}`)
      }
    } else {
      throw err
    }
  }

  const envRaw = await readFile(ENV_PATH, 'utf8')
  await writeFile(ENV_PATH, upsertEnvContent(envRaw, ENV_KEYS), 'utf8')
  log(`已写入 ${ENV_PATH}：${Object.keys(ENV_KEYS).join(', ')}`)

  let exampleRaw = ''
  try {
    exampleRaw = await readFile(ENV_EXAMPLE_PATH, 'utf8')
  } catch {
    exampleRaw = ''
  }
  // .env.example 保持默认 none，仅确保三键存在便于对照
  const nextExample = upsertEnvContent(exampleRaw, {
    RAG_EMBEDDING_PROVIDER: 'none',
    RAG_OLLAMA_BASE_URL: OLLAMA_HOST,
    RAG_OLLAMA_EMBED_MODEL: EMBED_MODEL
  })
  await writeFile(ENV_EXAMPLE_PATH, nextExample, 'utf8')
  log(`已同步 ${ENV_EXAMPLE_PATH} 中的 RAG embedding 示例键`)
}

async function main() {
  log(`平台：${process.platform}`)
  await ensureOllamaInstalled()

  if (!(await isOllamaUp())) {
    log('Ollama 未响应，尝试 ollama serve（后台）…')
    try {
      const child = spawn('ollama', ['serve'], {
        detached: true,
        stdio: 'ignore',
        shell: process.platform === 'win32'
      })
      child.unref()
    } catch {
      log('无法自动启动 serve；若使用 Desktop 版请从开始菜单启动 Ollama')
    }
  }

  await waitForOllama()
  log('Ollama 已就绪')
  await pullModel()
  await writeEnvFiles()
  log('完成。请重启 API（pnpm api:dev）使环境变量生效。')
}

main().catch((err) => {
  console.error(`[rag:setup-ollama] ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
