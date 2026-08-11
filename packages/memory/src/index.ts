/**
 * @openworker/memory — 单会话压缩 + 用户画像（纯函数，无 I/O）
 *
 * Native 粘合层见 services/native/src/agent/memory.ts。
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

export {
  DEFAULT_PROFILE_BUDGET,
  MAX_PROFILE_FACTS,
  resolveProfileBudget
} from './profile/budget.js'
export { extractProfileFacts, parseExtractedFactsJson } from './profile/extract.js'
export { composeMemorySystemSection, formatProfileSection } from './profile/format.js'
export { mergeProfileFacts, normalizeUserFact } from './profile/merge.js'

export type {
  CompactSessionInput,
  CompactSessionResult,
  ProfileBudget,
  SessionBudget,
  SessionWorkingInput,
  Summarizer,
  UserFact,
  UserFactSource,
  UserProfile
} from './types.js'
