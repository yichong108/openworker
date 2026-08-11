/**
 * 读取静态导出时的站点前缀（GitHub Pages 项目站为 `/repo`，本地为空）
 *
 * @returns 不以尾斜杠结尾的 base path；无前缀时返回空字符串
 */
export function getBasePath(): string {
  const raw = process.env.NEXT_PUBLIC_BASE_PATH || ''
  if (!raw || raw === '/') return ''
  return raw.endsWith('/') ? raw.slice(0, -1) : raw
}

/**
 * 为绝对路径资源补上 basePath，供 public 静态资源与内联样式使用
 *
 * Next.js 的 `Link` / `next/image` 会自动处理 basePath；原生 `url()`、`<img src>` 等需要手动拼接。
 *
 * @param path - 以 `/` 开头的站点内路径
 * @returns 带 basePath 的路径；相对路径原样返回
 */
export function withBasePath(path: string): string {
  if (!path.startsWith('/')) return path
  return `${getBasePath()}${path}`
}
