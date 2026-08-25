import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { getWorkspaceRoot } from './workspace-root'

/** 可选的 AI 提供方 */
export type AiProvider = 'cursor' | 'deepseek'

/**
 * 判断字符串是否为合法 AI 提供方。
 *
 * @param value - 原始值
 * @returns 是否为 cursor / deepseek
 */
export function isAiProvider(value: string): value is AiProvider {
  return value === 'cursor' || value === 'deepseek'
}

/** 磁盘上保存的 AI 配置（含密钥） */
export type AiConfig = {
  provider: AiProvider
  cursor: {
    apiKey: string
    model: string
  }
  deepseek: {
    apiKey: string
    model: string
  }
}

/** 返回给前端的配置（密钥只给掩码） */
export type AiConfigPublic = {
  provider: AiProvider
  cursor: {
    hasKey: boolean
    keyHint: string
    model: string
  }
  deepseek: {
    hasKey: boolean
    keyHint: string
    model: string
  }
}

const DEFAULT_CURSOR_MODEL = 'composer-2.5'
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat'

/**
 * Cursor 默认模型，拉列表失败时仍保证下拉有一项。
 */
export function defaultCursorModel(): string {
  return DEFAULT_CURSOR_MODEL
}

/**
 * DeepSeek 默认模型，拉列表失败时仍保证下拉有一项。
 */
export function defaultDeepseekModel(): string {
  return DEFAULT_DEEPSEEK_MODEL
}

/**
 * 本地 AI 配置文件路径（含密钥，不进 git）。
 *
 * @returns 绝对路径
 */
export function getAiConfigPath(): string {
  return join(getWorkspaceRoot(), '.agents', 'ap-config', 'ai-config.local.json')
}

/**
 * 给密钥做掩码，只露出末 4 位。
 *
 * @param key - 原始密钥
 * @returns 掩码文案
 */
export function maskApiKey(key: string): string {
  const trimmed = key.trim()
  if (!trimmed) return ''
  if (trimmed.length <= 4) return '••••'
  return `••••${trimmed.slice(-4)}`
}

function emptyConfig(): AiConfig {
  return {
    provider: 'cursor',
    cursor: { apiKey: '', model: DEFAULT_CURSOR_MODEL },
    deepseek: { apiKey: '', model: DEFAULT_DEEPSEEK_MODEL }
  }
}

/**
 * 读取本地 AI 配置；文件不存在则返回默认值。
 *
 * @returns 完整配置（含密钥）
 */
export function readAiConfig(): AiConfig {
  const path = getAiConfigPath()
  const fallback = emptyConfig()
  if (!existsSync(path)) return fallback
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<AiConfig>
    return {
      provider: parsed.provider === 'deepseek' ? 'deepseek' : 'cursor',
      cursor: {
        apiKey:
          typeof parsed.cursor?.apiKey === 'string' ? parsed.cursor.apiKey : fallback.cursor.apiKey,
        model:
          typeof parsed.cursor?.model === 'string' && parsed.cursor.model.trim()
            ? parsed.cursor.model.trim()
            : fallback.cursor.model
      },
      deepseek: {
        apiKey:
          typeof parsed.deepseek?.apiKey === 'string'
            ? parsed.deepseek.apiKey
            : fallback.deepseek.apiKey,
        model:
          typeof parsed.deepseek?.model === 'string' && parsed.deepseek.model.trim()
            ? parsed.deepseek.model.trim()
            : fallback.deepseek.model
      }
    }
  } catch {
    return fallback
  }
}

/**
 * 把配置转成可下发给前端的公开形态。
 *
 * @param config - 含密钥的配置
 * @returns 不含明文密钥的公开配置
 */
export function toPublicAiConfig(config: AiConfig): AiConfigPublic {
  return {
    provider: config.provider,
    cursor: {
      hasKey: Boolean(config.cursor.apiKey.trim()),
      keyHint: maskApiKey(config.cursor.apiKey),
      model: config.cursor.model
    },
    deepseek: {
      hasKey: Boolean(config.deepseek.apiKey.trim()),
      keyHint: maskApiKey(config.deepseek.apiKey),
      model: config.deepseek.model
    }
  }
}

/** 保存 AI 配置时前端提交的字段 */
export type AiConfigPatch = {
  provider?: AiProvider
  cursor?: { apiKey?: string; model?: string; clearKey?: boolean }
  deepseek?: { apiKey?: string; model?: string; clearKey?: boolean }
}

/**
 * 合并并写入 AI 配置。空 apiKey 表示保留原密钥。
 *
 * @param patch - 部分更新
 * @returns 写入后的完整配置
 */
export function writeAiConfig(patch: AiConfigPatch): AiConfig {
  const current = readAiConfig()
  const next: AiConfig = {
    provider: patch.provider ?? current.provider,
    cursor: {
      apiKey: current.cursor.apiKey,
      model: current.cursor.model
    },
    deepseek: {
      apiKey: current.deepseek.apiKey,
      model: current.deepseek.model
    }
  }

  if (patch.cursor) {
    if (patch.cursor.clearKey) next.cursor.apiKey = ''
    else if (typeof patch.cursor.apiKey === 'string' && patch.cursor.apiKey.trim()) {
      next.cursor.apiKey = patch.cursor.apiKey.trim()
    }
    if (typeof patch.cursor.model === 'string' && patch.cursor.model.trim()) {
      next.cursor.model = patch.cursor.model.trim()
    }
  }
  if (patch.deepseek) {
    if (patch.deepseek.clearKey) next.deepseek.apiKey = ''
    else if (typeof patch.deepseek.apiKey === 'string' && patch.deepseek.apiKey.trim()) {
      next.deepseek.apiKey = patch.deepseek.apiKey.trim()
    }
    if (typeof patch.deepseek.model === 'string' && patch.deepseek.model.trim()) {
      next.deepseek.model = patch.deepseek.model.trim()
    }
  }

  const path = getAiConfigPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return next
}

/**
 * 判断错误是否像模型/API 鉴权失败，用于打开配置弹窗。
 *
 * @param error - 捕获的异常或文案
 * @returns 是否视为鉴权问题
 */
export function isAiAuthFailure(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase()
  return /401|unauthor|forbidden|api[_ ]?key|auth|login|凭证|未登录|鉴权/.test(msg)
}
