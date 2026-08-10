import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * 持久化在 `index.json` 中的单篇文档记录
 */
export type IndexedDocument = {
  id: string
  text: string
  metadata?: Record<string, string>
  chunks: string[]
  updatedAt: number
}

/**
 * 单库关键词索引文件结构
 */
export type KeywordIndexFile = {
  version: 1
  documents: Record<string, IndexedDocument>
}

const INDEX_FILE_NAME = 'index.json'

/**
 * 解析知识库索引文件路径
 *
 * @param persistDir - 知识库持久化目录
 */
export function getIndexFilePath(persistDir: string): string {
  return path.join(persistDir, INDEX_FILE_NAME)
}

/**
 * 从磁盘加载关键词索引；文件不存在时返回空索引
 *
 * @param persistDir - 知识库持久化目录
 * @returns 索引对象
 * @throws 当文件存在但 JSON 非法时抛出
 */
export async function loadKeywordIndex(persistDir: string): Promise<KeywordIndexFile> {
  const filePath = getIndexFilePath(persistDir)
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as KeywordIndexFile
    if (!parsed || parsed.version !== 1 || typeof parsed.documents !== 'object') {
      return { version: 1, documents: {} }
    }
    return parsed
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return { version: 1, documents: {} }
    }
    throw err
  }
}

/**
 * 将关键词索引原子写入磁盘
 *
 * @param persistDir - 知识库持久化目录
 * @param index - 索引内容
 */
export async function saveKeywordIndex(persistDir: string, index: KeywordIndexFile): Promise<void> {
  await mkdir(persistDir, { recursive: true })
  const filePath = getIndexFilePath(persistDir)
  const tmpPath = `${filePath}.${process.pid}.tmp`
  await writeFile(tmpPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
  const { rename } = await import('node:fs/promises')
  await rename(tmpPath, filePath)
}
