/** 任务看板列，与 tasks 目录名一致 */
export type TaskColumn = 'todo' | 'doing' | 'done' | 'blocked'

/** 任务优先级，缺省按 P2 处理 */
export type TaskPriority = 'P0' | 'P1' | 'P2' | 'P3'

/** 折叠卡片所需字段 */
export type TaskSummary = {
  /** 相对 tasks 根的 POSIX 路径，如 todo/task-xxx.md */
  id: string
  fileName: string
  title: string
  /** 以所在目录为准，不以文件内 Status 字段为准 */
  status: TaskColumn
  priority: TaskPriority
  /** 任务 markdown 文件的 mtime，ISO 8601 */
  updatedAt: string
}

/** 列内展开后展示的完整字段 */
export type TaskDetail = TaskSummary & {
  humanNotes: string
  agentNotes: string
  markdown: string
}

/** 四列任务列表 */
export type TaskBoardPayload = {
  todo: TaskSummary[]
  doing: TaskSummary[]
  done: TaskSummary[]
  blocked: TaskSummary[]
}

/** 创建任务时可由前端提交的字段 */
export type CreateTaskInput = {
  /** 任务名称；空则先用备注首行落盘，再异步用 AI 起名 */
  title?: string
  priority?: TaskPriority
  humanNotes?: string
  /** 初始列，默认 todo */
  status?: TaskColumn
}

/** 编辑已有任务时可由前端提交的字段；未传的项保持原值 */
export type UpdateTaskInput = {
  title?: string
  priority?: TaskPriority
  humanNotes?: string
}

/** 看板会展示的四列（不含 plan / 工具集） */
export const TASK_COLUMNS: TaskColumn[] = ['todo', 'doing', 'done', 'blocked']

/** 列标题 */
export const COLUMN_LABELS: Record<TaskColumn, string> = {
  todo: '待办',
  doing: '进行中',
  done: '已完成',
  blocked: '阻塞'
}

/** 写入 markdown 的 Status 文案，与目录对应 */
export const COLUMN_STATUS_TEXT: Record<TaskColumn, string> = {
  todo: 'TODO',
  doing: 'DOING',
  done: 'DONE',
  blocked: 'BLOCKED'
}

/**
 * 判断字符串是否为合法任务列。
 *
 * @param value - 待检查值
 * @returns 是否为 todo/doing/done/blocked
 */
export function isTaskColumn(value: string): value is TaskColumn {
  return (TASK_COLUMNS as string[]).includes(value)
}

/**
 * 判断字符串是否为合法优先级。
 *
 * @param value - 待检查值
 * @returns 是否为 P0–P3
 */
export function isTaskPriority(value: string): value is TaskPriority {
  return value === 'P0' || value === 'P1' || value === 'P2' || value === 'P3'
}

/**
 * 新建任务对话框中的写入路径说明。
 *
 * @param column - 目标列
 * @returns 提示文案
 */
export function columnCreateHint(column: TaskColumn): string {
  if (column === 'done') {
    return `写入 done/${new Date().getFullYear()}/，文件名按时间戳生成。`
  }
  return `写入 ${column}/，文件名按时间戳生成。`
}
