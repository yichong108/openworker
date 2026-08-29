import type { TaskDetail } from '@/lib/task-types'

/**
 * 根据任务详情拼出自动执行 prompt。
 *
 * @param task - 任务详情
 * @returns Agent prompt
 */
export function buildTaskPrompt(task: TaskDetail): string {
  return [
    `任务文件所在的目录为：<工作区根目录>/.agents/ap-config/work-data/tasks/`,
    '你只执行下面这一件任务，不要领取、移动或改动其它任务文件。',
    `当前任务文件：${task.id}`,
    '',
    `# ${task.title}`,
    '',
    '## description',
    task.description.trim() || '（空）',
    '',
    '## 正文（Agent 填写区）',
    task.agentNotes.trim() || '（空）',
    '<在这里输出你的回答>'
  ].join('\n')
}
