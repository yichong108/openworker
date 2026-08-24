import { TerminalManager } from '@openworker/tools'

/**
 * Native 进程内终端管理器，仅服务右侧栏 /terminal 路由。
 *
 * Agent shell 不共用此实例：每次工具调用独立 spawn，取消靠 abortSignal。
 */
export const terminalManager = new TerminalManager()
