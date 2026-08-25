import { ipcRenderer } from 'electron'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogPayload = {
  level: LogLevel
  module: string
  msg?: string
  bindings?: Record<string, unknown>
}

/** 经 IPC 转发到主进程 pino */
export function createLogWrite(): (payload: LogPayload) => void {
  return (payload: LogPayload) => {
    ipcRenderer.send('log:write', payload)
  }
}
