import type { ChatComposerSkill } from './types.js'

/** 输入框中活跃的 `/` 技能触发 token */
export type SlashSkillToken = {
  /** `/` 在全文中的起始下标 */
  start: number
  /** 光标位置（token 结束下标） */
  end: number
  /** `/` 之后的过滤查询（不含 `/`） */
  query: string
}

/**
 * 从光标位置解析当前是否处于 `/技能` 触发态。
 *
 * 规则：
 * - `/` 必须位于文本开头、或紧跟空白/换行之后
 * - query 不允许包含空白或额外 `/`（空白表示 token 已结束）
 */
export function findActiveSlashSkillToken(text: string, cursor: number): SlashSkillToken | null {
  if (cursor < 1 || cursor > text.length) return null
  const before = text.slice(0, cursor)
  const match = /(?:^|[\s\n])(\/([^\s/]*))$/.exec(before)
  if (!match) return null
  const token = match[1]
  const query = match[2] ?? ''
  const start = cursor - token.length
  return { start, end: cursor, query }
}

/** 按 query 过滤技能列表（名称与描述子串匹配，大小写不敏感） */
export function filterSkillsByQuery(
  skills: ChatComposerSkill[],
  query: string
): ChatComposerSkill[] {
  const q = query.trim().toLowerCase()
  if (!q) return skills
  return skills.filter((item) => {
    const name = item.name.toLowerCase()
    const desc = item.description.toLowerCase()
    return name.includes(q) || desc.includes(q)
  })
}

/** 将活跃 `/query` 替换为 `/skillName `（末尾空格便于继续输入） */
export function applySkillSlashSelection(
  text: string,
  token: SlashSkillToken,
  skillName: string
): { nextText: string; nextCursor: number } {
  const insertion = `/${skillName} `
  const nextText = text.slice(0, token.start) + insertion + text.slice(token.end)
  const nextCursor = token.start + insertion.length
  return { nextText, nextCursor }
}
