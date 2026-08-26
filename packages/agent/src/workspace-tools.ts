import { type AgentComposerMode } from '@openworker/shared'
import type { ToolSet } from 'ai'
import {
  buildFsTools,
  buildGrepTool,
  buildShellTool,
  buildWebSearchTool,
  filterToolSet,
  isTavilyConfigured,
  mergeToolSets,
  type ToolOnTool
} from '@openworker/tools'

/** Ask / Plan 模式允许的只读工具名 */
const READONLY_MODE_ALLOWED_TOOL_NAMES = new Set(['read_file', 'glob', 'grep', 'web_search'])

/**
 * 判断 composer 模式是否为只读（ask / plan）。
 *
 * @param mode - 发送模式
 * @returns 是否只读
 */
export function isReadonlyComposerMode(mode?: AgentComposerMode): boolean {
  return mode === 'ask' || mode === 'plan'
}

/**
 * 组装工作区基础工具（fs / grep / shell / 可选 web_search）的选项。
 */
export type BuildWorkspaceToolsOptions = {
  root: string
  /** Tavily API Key；未配置时不注册 web_search */
  tavilyApiKey?: string
  /** 工具生命周期观察回调 */
  onTool: ToolOnTool
  /**
   * ask / plan：仅只读工具；build（默认）：含写文件与 shell。
   * 未传则返回完整工具集。
   */
  mode?: AgentComposerMode
}

/**
 * 构建工作区内置工具列表。
 *
 * 这是 agent 内建能力：读写文件、搜索、shell、可选联网搜索。
 *
 * @param options - 工作区、Tavily 与观察回调
 * @returns AI SDK ToolSet
 */
export function buildWorkspaceTools(options: BuildWorkspaceToolsOptions): ToolSet {
  const { root, tavilyApiKey, onTool, mode } = options

  const tools = mergeToolSets(
    buildFsTools({ root, onTool }),
    buildGrepTool({ root, onTool }),
    buildShellTool({ root, onTool }),
    buildWebSearchTool({ tavilyApiKey, onTool })
  )

  if (isReadonlyComposerMode(mode)) {
    return filterToolSet(tools, (name) => READONLY_MODE_ALLOWED_TOOL_NAMES.has(name))
  }
  return tools
}

/**
 * 组装工作区 system prompt 时的可选增强片段（由宿主注入）。
 */
export type WorkspacePromptExtras = {
  /** skills 摘要 */
  skillHint?: string
  /** 产品层附加段落（如 MCP 上下文），原样拼入 prompt */
  extraPrompt?: string
}

/**
 * 面向聊天渲染的 Markdown 回复规范（对齐 Cursor 类助手的可读性习惯）。
 *
 * 约束加粗与 checkbox 的滥用，并用短示例锚定输出形态。
 */
function buildMarkdownReplyStylePrompt(): string {
  return `## 回复 Markdown 格式（必须遵守）
面向聊天界面渲染，风格接近 Cursor：干净、可读、少装饰。

规则：
- **正文默认不加粗**。不要整句/整段加粗；\`**加粗**\` 仅用于极少数关键术语或短标签（每段最多 1～2 处）。
- **不要用任务列表 checkbox**（禁止 \`- [ ]\` / \`- [x]\`）。普通要点用 \`- \` 无序列表。
- 标题少用：需要分层时最多用 \`##\` / \`###\`；短回答可直接段落 + 列表，不必强行加标题。
- 路径、标识符、命令、文件名用行内代码；多行代码用围栏代码块并标注语言（如 \`\`\`ts）。
- 表格仅在对比多列结构化信息时使用；不要用表格做普通说明。
- 少用分隔线 \`---\` 与装饰性符号；不要堆叠 emoji。

示例（请按此密度与语气输出）：

已定位问题：\`WorkspaceCenterPane.scss\` 里表格外边框与单元格边框叠在一起，看起来偏粗。

改动建议：
- 去掉表格容器外边框，只保留单元格分隔线
- 用容器 \`border-radius: 6px\` + \`overflow: hidden\` 做圆角

\`\`\`scss
.app-message-markdown-table-wrap {
  border: 1px solid var(--aw-color-border);
  border-radius: 6px;
  overflow: hidden;
}
\`\`\`

若需自动改文件，切换到构建模式即可。`
}

/**
 * 根据 composer mode 组装工作区 ReAct system prompt。
 *
 * @param mode - ask / plan / build
 * @param root - 工作区根目录
 * @param tavilyApiKey - 可选 Tavily API Key（影响 web_search 相关提示）
 * @param extras - 宿主增强片段
 * @returns 完整 system prompt
 */
export function buildWorkspaceRunPrompt(
  mode: AgentComposerMode,
  root: string,
  tavilyApiKey?: string,
  extras?: WorkspacePromptExtras
): string {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'
  const common = [
    `当前日期时间：${new Date().toLocaleString()}；时区：${timeZone}；`,
    `工作区根目录：${root}；`
  ].join('\n')
  if (mode === 'ask') {
    return [common, buildAskSystemPrompt(root, tavilyApiKey), extras?.extraPrompt]
      .filter(Boolean)
      .join('\n\n')
  }
  if (mode === 'plan') {
    return [common, buildPlanSystemPrompt(root, tavilyApiKey), extras?.extraPrompt]
      .filter(Boolean)
      .join('\n\n')
  }
  return [
    common,
    buildBuildSystemPrompt(root, tavilyApiKey, extras),
    extras?.skillHint,
    extras?.extraPrompt
  ]
    .filter(Boolean)
    .join('\n\n')
}

function buildBuildSystemPrompt(
  root: string,
  tavilyApiKey?: string,
  extras?: WorkspacePromptExtras
): string {
  const web = isTavilyConfigured(tavilyApiKey)
  const toolLine = web
    ? 'read_file、write_file、delete_file、glob、grep、shell、web_search（Tavily 联网搜索）'
    : 'read_file、write_file、delete_file、glob、grep、shell（未配置 Tavily API Key 时无 web_search）'

  const webRule = web
    ? '- 用户询问**天气、气温、降雨、实时新闻、股价、政策**等需要外部信息时，必须先调用 **web_search** 再回答；不要编造天气或声称「搜索失败」。'
    : '- 未配置 Tavily，**web_search 不可用**：若用户需要今日天气等实时信息，明确告知在应用设置中填写「Tavily API Key」或配置环境变量 TAVILY_API_KEY；可建议天气网站/App；不要声称「搜索引擎坏了」或「无法联网」。'

  const hasSkills = Boolean(extras?.skillHint?.trim())
  const skillTools = hasSkills
    ? '，以及 readSkillFile、readSkillRelativeFile（渐进加载 skills）'
    : ''
  const skillRule = hasSkills
    ? '- **优先 readSkillFile**：用户意图明显匹配某 skill 描述时，必须先调用 readSkillFile 获取完整指令，再按需 readSkillRelativeFile 读取附属文件，然后使用 read_file、glob、grep、shell；不要跳过匹配的技能而用泛化工具猜测。'
    : ''

  return `你是协助办公与软件开发的智能体。
- 工具中使用**相对于工作区根目录**的路径（如 src/index.ts）；不要用 ../ 逃出工作区。
- 可用工具：${toolLine}${skillTools}。
${skillRule}
- shell 在工作区根目录沙箱中执行命令并等待结束，返回 stdout/stderr；Windows 使用 cmd 风格。
- 用户要「查看/读取工作区文件」时，优先 read_file；按文件名/路径模式查找时用 glob（如 **/*.ts）。
- 用户明确要求删除工作区中的文件时，使用 delete_file（仅普通文件，不含目录）。
${webRule}
- 回复简洁可执行；改代码前先 read/glob。
- 先理解任务 → 必要时复述目标 → 再选工具。

${buildMarkdownReplyStylePrompt()}`
}

function buildAskSystemPrompt(root: string, tavilyApiKey?: string): string {
  const web = isTavilyConfigured(tavilyApiKey)
  const toolLine = web
    ? 'read_file、glob、grep、web_search（Tavily）'
    : 'read_file、glob、grep（未配置 Tavily 时无 web_search）'
  const webRule = web
    ? '- 需要外部信息时调用 **web_search**；不要编造搜索结果。'
    : '- 未配置 Tavily：若用户需要实时信息，如实说明并建议在设置中配置 Tavily。'
  return `你是帮助理解代码、架构与命令的助手（问答模式）。
- 禁止修改工作区文件、删除文件、执行 shell、调用 readSkillFile / readSkillRelativeFile 或 mcp_*；本模式下这些工具不可用。
- 仅只读工具：${toolLine}。路径均相对于工作区根目录。
- 若用户要求「直接改代码 / 跑命令 / 打补丁」，说明问答模式不能自动执行，给出可复制片段或步骤；要自动应用请切换到构建模式。
${webRule}
- 回复清晰可验证：下结论前先 read/glob/grep 仓库内容。
- 先理解意图 → 必要时复述目标

${buildMarkdownReplyStylePrompt()}
`
}

/**
 * Plan 模式 system prompt：只读调研并产出可审阅实施计划。
 *
 * @param root - 工作区根目录（写入提示上下文）
 * @param tavilyApiKey - 可选 Tavily Key
 */
function buildPlanSystemPrompt(root: string, tavilyApiKey?: string): string {
  const web = isTavilyConfigured(tavilyApiKey)
  const toolLine = web
    ? 'read_file、glob、grep、web_search（Tavily）'
    : 'read_file、glob、grep（未配置 Tavily 时无 web_search）'
  const webRule = web
    ? '- 需要外部信息时调用 **web_search**；不要编造搜索结果。'
    : '- 未配置 Tavily：若用户需要实时信息，如实说明并建议在设置中配置 Tavily。'
  return `你是协助软件开发的规划助手（计划模式 / Plan Mode）。
- 禁止修改工作区文件、删除文件、执行 shell、调用 readSkillFile / readSkillRelativeFile 或 mcp_*；本模式下这些工具不可用。
- 仅只读工具：${toolLine}。路径均相对于工作区根目录（${root}）。
- 工作流程：
  1. 需求不清时先提出关键澄清问题（可多轮），不要急于给完整计划。
  2. 用只读工具调研相关文件、现有模式与约束。
  3. 准备好后产出结构化实施计划，供用户审阅；用户批准后才会在「构建」模式写代码。
- 最终计划必须放在一个 \`\`\`openworker-plan\`\`\` fenced block 中（语言标签恰好为 openworker-plan）。围栏外可写简短说明。
- 计划结构建议包含：标题、概述、关键文件路径、分步 todos、风险与非目标。
- 若用户要求「直接改代码」，说明计划模式不能写文件，请其审阅计划后点击「构建计划」，或切换到构建模式。
${webRule}
- 下结论前先 read/glob/grep；计划要具体可执行，避免空泛口号。

${buildMarkdownReplyStylePrompt()}
`
}
