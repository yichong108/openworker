import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { getWorkspaceRoot } from '@/lib/workspace-root'

/** 磁盘上保存的 AI 配置（含密钥） */
export type AiConfig = {
  deepseek: {
    apiKey: string
    model: string
  }
  tavily: {
    apiKey: string
  }
}

/** 返回给前端的配置（密钥只给掩码） */
export type AiConfigPublic = {
  deepseek: {
    hasKey: boolean
    keyHint: string
    model: string
  }
  tavily: {
    hasKey: boolean
    keyHint: string
  }
}

const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat'

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
    deepseek: { apiKey: '', model: DEFAULT_DEEPSEEK_MODEL },
    tavily: { apiKey: '' }
  }
}

/**
 * 读取本地 AI 配置；文件不存在则返回默认值。
 * 兼容旧格式（含 cursor / provider 字段）。
 *
 * @returns 完整配置（含密钥）
 */
export function readAiConfig(): AiConfig {
  const path = getAiConfigPath()
  const fallback = emptyConfig()
  if (!existsSync(path)) return fallback
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<{
      deepseek?: { apiKey?: string; model?: string }
      tavily?: { apiKey?: string }
    }>
    return {
      deepseek: {
        apiKey:
          typeof parsed.deepseek?.apiKey === 'string'
            ? parsed.deepseek.apiKey
            : fallback.deepseek.apiKey,
        model:
          typeof parsed.deepseek?.model === 'string' && parsed.deepseek.model.trim()
            ? parsed.deepseek.model.trim()
            : fallback.deepseek.model
      },
      tavily: {
        apiKey:
          typeof parsed.tavily?.apiKey === 'string' ? parsed.tavily.apiKey : fallback.tavily.apiKey
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
    deepseek: {
      hasKey: Boolean(config.deepseek.apiKey.trim()),
      keyHint: maskApiKey(config.deepseek.apiKey),
      model: config.deepseek.model
    },
    tavily: {
      hasKey: Boolean(config.tavily.apiKey.trim()),
      keyHint: maskApiKey(config.tavily.apiKey)
    }
  }
}

/** 保存 AI 配置时前端提交的字段 */
export type AiConfigPatch = {
  deepseek?: { apiKey?: string; model?: string; clearKey?: boolean }
  tavily?: { apiKey?: string; clearKey?: boolean }
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
    deepseek: {
      apiKey: current.deepseek.apiKey,
      model: current.deepseek.model
    },
    tavily: {
      apiKey: current.tavily.apiKey
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

  if (patch.tavily) {
    if (patch.tavily.clearKey) next.tavily.apiKey = ''
    else if (typeof patch.tavily.apiKey === 'string' && patch.tavily.apiKey.trim()) {
      next.tavily.apiKey = patch.tavily.apiKey.trim()
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
