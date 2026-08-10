/**
 * @openworker/memory — 单会话上下文压缩（纯函数，无 I/O）
 *
 * Desktop 粘合层见 apps/desktop/src/main/agent/memory.ts。
 */

export { compactSessionHistory } from './compact.js'
export {
  DEFAULT_REFINE_TEMPERATURE,
  DEFAULT_SESSION_BUDGET,
  estimateMessageChars,
  messageContentToText,
  resolveSessionBudget,
  truncateChars
} from './budget.js'
export { formatSessionSystemSection } from './format.js'
export {
  extractPinnedFromUserText,
  heuristicSummarizeMessages,
  mergePinned,
  mergeSummaries
} from './heuristic-summary.js'
export { refineSessionSummary } from './summarize.js'
export type {
  CompactSessionInput,
  CompactSessionResult,
  SessionBudget,
  SessionWorkingInput,
  Summarizer
} from './types.js'
