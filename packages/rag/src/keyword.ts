/** 默认返回的命中条数 */
export const DEFAULT_TOP_K = 5

/** 单个命中片段的最大字符数 */
export const MAX_SNIPPET_CHARS = 800

/** 按段落切分时每个 chunk 的软上限（字符） */
export const MAX_CHUNK_CHARS = 1200

/**
 * 将查询或正文切成简单关键词 token
 *
 * 规则：空白分隔；连续 CJK 字符按单字；连续拉丁/数字保留为词并小写。
 * 不做复杂中文分词，便于 MVP 零依赖运行。
 *
 * @param text - 原始文本
 * @returns 去重前的 token 列表（保留重复以便计词频）
 */
export function tokenize(text: string): string[] {
  const normalized = text.trim()
  if (!normalized) return []

  const tokens: string[] = []
  let buffer = ''

  const flushLatin = () => {
    if (!buffer) return
    tokens.push(buffer.toLowerCase())
    buffer = ''
  }

  for (const ch of normalized) {
    if (/\s/.test(ch)) {
      flushLatin()
      continue
    }
    if (/[\u4e00-\u9fff]/.test(ch)) {
      flushLatin()
      tokens.push(ch)
      continue
    }
    if (/[A-Za-z0-9_./-]/.test(ch)) {
      buffer += ch
      continue
    }
    flushLatin()
  }
  flushLatin()

  return tokens.filter((t) => t.length > 0)
}

/**
 * 将文档正文切成检索用 chunk
 *
 * 优先按空行分段；过长段落再按硬上限切开。
 *
 * @param text - 文档全文
 * @param maxChunkChars - 单 chunk 软上限
 * @returns chunk 文本列表（已 trim，空段丢弃）
 */
export function splitIntoChunks(text: string, maxChunkChars: number = MAX_CHUNK_CHARS): string[] {
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)

  const chunks: string[] = []
  for (const paragraph of paragraphs.length > 0 ? paragraphs : [text.trim()].filter(Boolean)) {
    if (paragraph.length <= maxChunkChars) {
      chunks.push(paragraph)
      continue
    }
    for (let i = 0; i < paragraph.length; i += maxChunkChars) {
      const slice = paragraph.slice(i, i + maxChunkChars).trim()
      if (slice) chunks.push(slice)
    }
  }
  return chunks
}

/**
 * 计算查询 token 相对 chunk 的简单相关分
 *
 * score = 命中的 distinct query token 数 / query token 总数 + 命中次数加权。
 *
 * @param queryTokens - 查询 token
 * @param chunkText - chunk 正文
 * @returns 分数；无命中为 0
 */
export function scoreChunk(queryTokens: string[], chunkText: string): number {
  if (queryTokens.length === 0) return 0
  const chunkTokens = tokenize(chunkText)
  if (chunkTokens.length === 0) return 0

  const chunkSet = new Set(chunkTokens)
  const freq = new Map<string, number>()
  for (const t of chunkTokens) {
    freq.set(t, (freq.get(t) ?? 0) + 1)
  }

  const uniqueQuery = [...new Set(queryTokens)]
  let hitDistinct = 0
  let hitCount = 0
  for (const t of uniqueQuery) {
    if (chunkSet.has(t)) {
      hitDistinct += 1
      hitCount += freq.get(t) ?? 0
    }
  }
  if (hitDistinct === 0) return 0

  const coverage = hitDistinct / uniqueQuery.length
  const density = hitCount / (chunkTokens.length + 1)
  return coverage * 10 + density
}

/**
 * 截断命中片段文本
 *
 * @param text - 原文
 * @param maxChars - 最大字符数
 */
export function truncateSnippet(text: string, maxChars: number = MAX_SNIPPET_CHARS): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`
}
