import type { TaskColumn } from './task-types'
import { COLUMN_LABELS, TASK_COLUMNS } from './task-types'

/** 列强调色，用于列头色条与状态 Radio。 */
export function columnAccent(column: TaskColumn): string {
  if (column === 'todo') return 'var(--brass)'
  if (column === 'doing') return 'var(--teal)'
  if (column === 'done') return 'var(--sage)'
  return 'var(--rust)'
}

/** 状态 Radio 单项对应的样式类 */
export const STATUS_RADIO_CLASS: Record<TaskColumn, string> = {
  todo: 'ap-status-radio--todo',
  doing: 'ap-status-radio--doing',
  done: 'ap-status-radio--done',
  blocked: 'ap-status-radio--blocked'
}

export { COLUMN_LABELS, TASK_COLUMNS }
