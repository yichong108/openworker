/// <reference types="vite/client" />

import type {
  AboutAppInfo,
  RendererUiState,
  WebEditAction,
  WindowChromeAction,
  WorkspaceFileContentResult,
  WorkspaceFileTreePayload
} from '@/shared/ipc'

/** 扩展 Vite 环境变量类型（渲染进程直连 Native 数据面） */
declare global {
  interface ImportMetaEnv {
    readonly VITE_API_URL?: string
    readonly VITE_OPENWORKER_NATIVE_BASE_URL?: string
  }
}

/**
 * 精简后的 Electron bridge：仅保留本机能力（窗口 / UI 状态 / 文件树 / 选目录对话框）。
 * 工作区、会话、Agent、settings、skills、MCP、终端已迁至 Native HTTP/SSE。
 */
type Api = {
  platform: NodeJS.Platform
  windowAction: (action: WindowChromeAction) => Promise<void>
  /** true：允许系统最小化/最大化/关闭；false：禁用（弹窗打开时） */
  setCaptionControlsVisible: (visible: boolean) => void
  webEdit: (action: WebEditAction) => Promise<void>
  showAbout: () => Promise<AboutAppInfo>
  /** 系统目录选择对话框；仅返回 path，由渲染层自行 upsert */
  selectWorkspace: () => Promise<{ path: string }>
  /**
   * 设置主进程文件树 / 读文件所用的绝对根路径（可选；新主进程可能尚未实现）。
   *
   * @param rootPath - 工作区绝对路径；null 表示清除
   */
  setWorkspaceFsRoot: (rootPath: string | null) => Promise<{ ok: true }>
  /**
   * 列出工作区文件树。
   *
   * @param rootPath - 可选绝对根路径；省略时依赖主进程当前 FS root
   */
  getWorkspaceFileTree: (rootPath?: string) => Promise<WorkspaceFileTreePayload>
  /**
   * 读取工作区内相对路径文件。
   *
   * @param rootPath - 工作区绝对根路径
   * @param relPath - 相对路径
   */
  readWorkspaceFile: (rootPath: string, relPath: string) => Promise<WorkspaceFileContentResult>
  getUiState: () => Promise<RendererUiState>
  setUiState: (patch: Partial<RendererUiState>) => Promise<RendererUiState>
  toggleDevtools: () => Promise<{ open: boolean }>
  openExternal: (url: string) => Promise<{ ok: boolean }>
}

declare global {
  interface Window {
    bridge: Api
  }
}

export {}
