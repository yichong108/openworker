/**
 * 把任务 id 编成 API 路径，按段编码以免斜杠被截断。
 *
 * 供浏览器 fetch 使用，不依赖 Node / next/server。
 *
 * @param id - 如 todo/task-xxx.md
 * @returns /api/tasks/...
 */
export function taskApiPath(id: string): string {
  return `/api/tasks/${id.split('/').map(encodeURIComponent).join('/')}`
}
