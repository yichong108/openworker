import { readAiConfig } from './ai-config'

const TITLE_MAX = 32

/**
 * 从想法抽出短标题：取首行有效文字，过长则截断。
 *
 * @param idea - 想法正文
 * @returns 可用作任务名称的短句
 */
export function titleFromIdeaFallback(idea: string): string {
  const line = idea
    .split(/\r?\n/)
    .map((item) => item.replace(/^[-*#>\s]+/, '').trim())
    .find(Boolean)
  if (!line) return '未命名任务'
  return clipTitle(line)
}

/**
 * 未填名称时用 AI 根据想法起短标题；未配置、超时或失败则返回空串。
 *
 * @param idea - 想法正文
 * @returns 清洗后的短名称，不可用则为空
 */
export async function generateTaskTitle(idea: string): Promise<string> {
  try {
    return sanitizeGeneratedTitle(await generateTitleWithAi(idea))
  } catch {
    return ''
  }
}

function clipTitle(value: string): string {
  const compact = value.replace(/\s+/g, ' ').trim()
  if (compact.length <= TITLE_MAX) return compact
  return `${compact.slice(0, TITLE_MAX).trim()}…`
}

function sanitizeGeneratedTitle(raw: string): string {
  const first = raw
    .replace(/^[#*\-\s]+/, '')
    .replace(/^["'「『]|["'」』。．.]+$/g, '')
    .split(/\r?\n/)[0]
    ?.trim()
  return first ? clipTitle(first) : ''
}

/**
 * 按当前 AI 配置生成短名称；未配置或超时则返回空串。
 *
 * @param idea - 想法正文
 * @returns 模型输出或空串
 */
async function generateTitleWithAi(idea: string): Promise<string> {
  const config = readAiConfig()
  const key = config.deepseek.apiKey.trim() || process.env.DEEPSEEK_API_KEY?.trim()
  if (!key) return ''

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.deepseek.model,
        temperature: 0.2,
        max_tokens: 48,
        messages: [
          {
            role: 'system',
            content:
              '把用户的任务想法压缩成简短任务名称。只输出名称，不超过 24 个汉字，不要标点、不要引号、不要解释。'
          },
          { role: 'user', content: idea.slice(0, 2000) }
        ]
      }),
      signal: controller.signal
    })
    if (!response.ok) return ''
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>
    }
    const content = payload.choices?.[0]?.message?.content
    return typeof content === 'string' ? content : ''
  } finally {
    clearTimeout(timer)
  }
}
