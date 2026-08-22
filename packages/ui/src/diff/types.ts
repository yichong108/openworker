/** 单行 diff 类型 */
export type FileDiffLineKind = 'add' | 'del' | 'ctx'

/** 统一 diff 中的一行 */
export type FileDiffLine = {
  kind: FileDiffLineKind
  text: string
  /** 旧文件行号（1-based；新增行无） */
  oldLine?: number
  /** 新文件行号（1-based；删除行无） */
  newLine?: number
}

/** FileEditDiff 组件所需的视图模型 */
export type FileEditDiffView = {
  path: string
  before: string
  after: string
  created: boolean
  deleted: boolean
  lines: FileDiffLine[]
}
