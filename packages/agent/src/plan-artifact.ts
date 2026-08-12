/**
 * Plan 模式计划工件解析：从助手终稿中提取 `openworker-plan` fenced block。
 */

/** 约定语言标签：```openworker-plan … ``` */
export const OPENWORKER_PLAN_FENCE_LANG = 'openworker-plan'

/** AG-UI CUSTOM 事件名：计划工件 */
export const OPENWORKER_PLAN_CUSTOM_NAME = 'openworker.plan'

/**
 * 从助手文本中解析出的计划工件。
 */
export type ParsedPlanArtifact = {
  /** 计划 Markdown 正文（不含围栏） */
  markdown: string
  /** 是否来自显式 fenced block；false 表示整段降级为计划 */
  fromFence: boolean
  /** 去掉计划围栏后的聊天说明（可能为空） */
  remainder: string
  /** 可选标题（取计划首个一级/二级标题） */
  title?: string
}

const FENCE_RE = /```openworker-plan\s*\r?\n([\s\S]*?)```/i

/**
 * 从计划 Markdown 提取可选标题（首个 # / ## 行）。
 *
 * @param markdown - 计划正文
 * @returns 标题文本；无则 undefined
 */
export function extractPlanTitle(markdown: string): string | undefined {
  const m = markdown.match(/^\s*#{1,2}\s+(.+?)\s*$/m)
  const title = m?.[1]?.trim()
  return title || undefined
}

/**
 * 解析助手终稿中的计划工件。
 *
 * 优先提取 \`\`\`openworker-plan\`\`\` 围栏内容；若不存在则将整段终稿视为计划（降级）。
 *
 * @param text - 助手最终回复文本
 * @returns 解析结果；文本为空时返回 null
 */
export function parsePlanArtifact(text: string): ParsedPlanArtifact | null {
  const raw = text ?? ''
  const trimmed = raw.trim()
  if (!trimmed) return null

  const match = FENCE_RE.exec(raw)
  if (match) {
    const markdown = (match[1] ?? '').trim()
    if (!markdown) return null
    const remainder =
      `${raw.slice(0, match.index)}${raw.slice(match.index + match[0].length)}`.trim()
    return {
      markdown,
      fromFence: true,
      remainder,
      title: extractPlanTitle(markdown)
    }
  }

  return {
    markdown: trimmed,
    fromFence: false,
    remainder: '',
    title: extractPlanTitle(trimmed)
  }
}

/**
 * 组装 Build 执行阶段注入的「已批准计划」system 段落。
 *
 * @param planMarkdown - 用户批准后的计划 Markdown
 * @returns 非空段落；空输入返回空串
 */
export function buildApprovedPlanSystemSection(planMarkdown: string): string {
  const body = planMarkdown.trim()
  if (!body) return ''
  return `## Approved plan（用户已批准，请按此执行）
以下是用户审阅并批准的实施计划。请严格按计划改代码，少做重新架构决策。
若发现计划与仓库现状明显冲突，先简要说明偏差与建议调整，再继续可安全执行的部分。

\`\`\`openworker-plan
${body}
\`\`\``
}
