/**
 * Prisma Client 单例 + 健康检查
 *
 * 使用 Prisma 5.x + SQLite，DATABASE_URL 从 env 读取。
 * 首次调用时懒加载并 validate schema。
 */

import { PrismaClient } from '@prisma/client'

import { nativeLog } from '../logger.js'

let prisma: PrismaClient | null = null

/** 本机画像单行主键 */
export const LOCAL_PROFILE_ID = 'default'

/** 全局 settings 单行主键 */
export const DEFAULT_SETTINGS_ID = 'default'

/**
 * 获取（并按需初始化）PrismaClient 单例
 *
 * @returns PrismaClient 实例
 */
export function getPrisma(): PrismaClient {
  if (prisma) {
    return prisma
  }

  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('[native] DATABASE_URL env is required')
  }

  prisma = new PrismaClient({
    datasourceUrl: url,
    log: ['warn', 'error']
  })

  return prisma
}

/**
 * 探测数据库是否可读写
 *
 * @returns 连通返回 true，否则 false
 */
export async function pingDb(): Promise<boolean> {
  try {
    const result = await getPrisma().$queryRaw`SELECT 1 AS ok`
    return Array.isArray(result) && result.length > 0
  } catch {
    return false
  }
}

/**
 * 关闭 Prisma 连接
 *
 * 供 SIGTERM/SIGINT 优雅退出使用；重复调用安全。
 */
export async function closeDb(): Promise<void> {
  if (!prisma) return
  try {
    await prisma.$disconnect()
  } catch (error) {
    nativeLog.error('prisma disconnect failed', error)
  } finally {
    prisma = null
  }
}
