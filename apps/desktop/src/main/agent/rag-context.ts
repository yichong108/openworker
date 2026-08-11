/**
 * Desktop 侧 RAG 预取：按本轮用户问题检索知识库，格式化为 system 注入段。
 *
 * 失败时返回空串（不阻断对话）；仅 OpenWorker 路径应调用。
 */

import { agentLog } from '@/main/agent/agent-log'
import { apiQueryRag } from '@/main/rag-api'

/** 预取默认 topK */
const DEFAULT_RAG_TOP_K = 5

/** 注入上下文最大字符数（防止撑爆 prompt） */
const MAX_RAG_SECTION_CHARS = 8_000

/**
 * 将 RAG 命中格式化为 system 段落
 *
 * @param query - 用户查询
 * @param nodes - 检索命中
 * @returns Markdown 段落；无命中时为空串
 */
export function formatRagSystemSection(
  query: string,
  nodes: Array<{
    text?: string
    score?: number
    documentId?: string
    knowledgeBaseName?: string
    id?: string
  }>
): string {
  if (nodes.length === 0) return ''

  const blocks = nodes.map((n, i) => {
    const source = [n.knowledgeBaseName, n.documentId ?? n.id].filter(Boolean).join(' / ')
    const score =
      typeof n.score === 'number' && Number.isFinite(n.score) ? ` score=${n.score.toFixed(3)}` : ''
    const text = (n.text ?? '').trim() || '（空片段）'
    return `[${i + 1}] ${source}${score}\n${text}`
  })

  let body = blocks.join('\n\n')
  if (body.length > MAX_RAG_SECTION_CHARS) {
    body = `${body.slice(0, MAX_RAG_SECTION_CHARS - 1)}…`
  }

  return [
    '## 知识库检索（本轮预取）',
    `用户问题：${query.trim()}`,
    '以下片段来自 OpenWorker 知识库；回答相关问题时优先依据这些内容，勿编造未出现的事实。',
    '',
    body
  ].join('\n')
}

/**
 * 按本轮用户消息预取知识库上下文
 *
 * @param userText - 本轮用户文本
 * @param options.knowledgeBaseId - 可选限定知识库
 * @param options.topK - 命中条数
 * @returns 可拼入 memorySystemSection 的段落；失败或无命中为空串
 */
export async function prefetchRagSystemSection(
  userText: string,
  options?: { knowledgeBaseId?: string; topK?: number }
): Promise<string> {
  const query = userText.trim()
  if (!query) return ''

  try {
    const result = await apiQueryRag({
      query,
      topK: options?.topK ?? DEFAULT_RAG_TOP_K,
      withAnswer: false,
      ...(options?.knowledgeBaseId?.trim()
        ? { knowledgeBaseId: options.knowledgeBaseId.trim() }
        : {})
    })
    const section = formatRagSystemSection(query, result.nodes ?? [])
    if (section) {
      agentLog.info(`[rag] prefetched nodes=${result.nodes?.length ?? 0}`)
    }
    return section
  } catch (err) {
    agentLog.warn(`[rag] prefetch failed: ${err instanceof Error ? err.message : String(err)}`)
    return ''
  }
}
