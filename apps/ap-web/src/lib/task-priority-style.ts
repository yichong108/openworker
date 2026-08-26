import type { TaskPriority } from './task-types'

/** 任务优先级选项顺序 */
export const TASK_PRIORITIES: TaskPriority[] = ['P0', 'P1', 'P2', 'P3']

/** 折叠卡片上的优先级徽章样式 */
export const PRIORITY_BADGE_CLASS: Record<TaskPriority, string> = {
  P0: 'bg-[var(--rust)] text-white',
  P1: 'bg-[var(--brass)] text-[var(--ink)]',
  P2: 'bg-[var(--teal)] text-white',
  P3: 'bg-black/15 text-[var(--ink-soft)]'
}

/** 优先级 Radio 单项对应的样式类 */
export const PRIORITY_RADIO_CLASS: Record<TaskPriority, string> = {
  P0: 'ap-priority-radio--p0',
  P1: 'ap-priority-radio--p1',
  P2: 'ap-priority-radio--p2',
  P3: 'ap-priority-radio--p3'
}

/** 优先级 Tag 单项对应的样式类 */
export const PRIORITY_TAG_CLASS: Record<TaskPriority, string> = {
  P0: 'ap-priority-tag--p0',
  P1: 'ap-priority-tag--p1',
  P2: 'ap-priority-tag--p2',
  P3: 'ap-priority-tag--p3'
}
