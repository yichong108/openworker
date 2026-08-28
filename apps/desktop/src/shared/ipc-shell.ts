/**
 * Electron 壳 IPC 与本地类型 — 供 preload / 主进程使用，不依赖 Node 或 @openworker/shared。
 */

import type { BaseEvent } from '@ag-ui/client'
import dayjs from 'dayjs'

/**
 * Electron 壳 IPC 通道（业务数据面已迁 Native HTTP/SSE）
 */
export const IPC = {
  WORKSPACE_SELECT: 'workspace:select',
  /** 设置文件树 / 读文件所用绝对根路径 */
  WORKSPACE_FS_ROOT: 'workspace:fs-root',
  WORKSPACE_FILE_TREE: 'workspace:file-tree',
  WORKSPACE_FILE_CONTENT: 'workspace:file-content',
  UI_STATE_GET: 'ui-state:get',
  UI_STATE_SET: 'ui-state:set',
  DEVTOOLS_TOGGLE: 'devtools:toggle',
  EXTERNAL_OPEN: 'external:open',
  WINDOW_ACTION: 'window:action',
  /**
   * 是否显示并允许原生窗口控制（标题栏系统按钮区）。
   * 渲染层在 antd Modal 等层打开时置为 false；关闭弹窗后 true。
   */
  WINDOW_CAPTION_CONTROLS: 'window:caption-controls',
  WEB_EDIT: 'web:edit',
  APP_ABOUT: 'app:about'
} as const

/** 与 IPC.WINDOW_ACTION 对应的动作 */
export type WindowChromeAction = 'minimize' | 'maximize-toggle' | 'close' | 'reload' | 'quit'

/** 与 IPC.WEB_EDIT 对应的编辑命令 */
export type WebEditAction = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll'

/** 主进程聚合、渲染层「关于」弹窗展示 */
export type AboutAppInfo = {
  productName: string
  version: string
  /** 构建时注入的短 SHA，无 .git 或非 CI 检出时可能为空 */
  gitCommit: string
  /** 构建时的 ISO 时间（主进程包编译时刻） */
  buildIso: string
  electron: string
  chrome: string
  node: string
  v8: string
  osLine: string
}

/**
 * 将构建时刻 ISO 字符串格式化为用户本地时区日历钟。
 *
 * 构建时刻在打包时定死；展示时按当前时区换算，格式为 `YYYY-MM-DD HH:mm`。
 *
 * @param iso - ISO 时间
 */
export function formatBuildIsoLocalHuman(iso: string): string | null {
  const d = dayjs(iso)
  if (!d.isValid()) return null
  return d.format('YYYY-MM-DD HH:mm')
}

/**
 * 格式化「关于」面板可复制文本。
 *
 * @param info - 关于信息
 */
export function formatAboutAppCopyText(info: AboutAppInfo): string {
  const buildLine = (formatBuildIsoLocalHuman(info.buildIso) ?? info.buildIso) || '(未知)'
  return [
    info.productName,
    `版本: ${info.version}`,
    `提交: ${info.gitCommit || '(未知)'}`,
    `构建: ${buildLine}`,
    `Electron: ${info.electron}`,
    `Chromium: ${info.chrome}`,
    `Node.js: ${info.node}`,
    `V8: ${info.v8}`,
    `操作系统: ${info.osLine}`
  ].join('\n')
}

/** AGENT_STREAM 载荷（Renderer 消费 Native SSE 时复用） */
export type AgentStreamPayload = {
  sessionId: string
  event: BaseEvent
}

export type McpProbeToolInfo = {
  name: string
  description?: string
}

export type McpProbeResult = { ok: true; tools: McpProbeToolInfo[] } | { ok: false; error: string }

export type McpWarmupServerOk = {
  id: string
  name: string
  ok: true
  toolCount: number
}
export type McpWarmupServerErr = {
  id: string
  name: string
  ok: false
  error: string
}
export type McpWarmupServerResult = McpWarmupServerOk | McpWarmupServerErr

export type McpWarmupReport = {
  atMs: number
  servers: McpWarmupServerResult[]
}

export type McpWarmupStatus = {
  report: McpWarmupReport | null
  inFlight: boolean
}

export type RendererUiState = {
  activeWorkspaceId: string | null
  byWorkspace: Record<string, WorkspaceUiState>
}

export const defaultRendererUiState: RendererUiState = {
  activeWorkspaceId: null,
  byWorkspace: {}
}

/** 侧栏会话未读类型：plan 橙色，其他模式蓝色 */
export type SessionUnreadKind = 'plan' | 'other'

export type WorkspaceUiState = {
  activeSessionId: string | null
  inputDraft: string
  /** 仍存在于远端，但不在左侧会话列表中展示 */
  sidebarHiddenSessionIds?: string[]
  /** 侧栏未读：sessionId → plan(橙) | other(蓝) */
  unreadBySessionId?: Record<string, SessionUnreadKind>
}

export const defaultWorkspaceUiState: WorkspaceUiState = {
  activeSessionId: null,
  inputDraft: '',
  sidebarHiddenSessionIds: [],
  unreadBySessionId: {}
}

export type WorkspaceInfo = {
  id: string
  name: string
  path: string | null
  createdAt: number
  updatedAt: number
  isDefault?: boolean
}

export type WorkspaceFileNode = {
  name: string
  /** 相对工作区根路径（POSIX 斜杠） */
  path: string
  kind: 'directory' | 'file'
  children?: WorkspaceFileNode[]
}

export type WorkspaceFileTreePayload = {
  rootPath: string
  nodes: WorkspaceFileNode[]
}

export type WorkspaceFileContentResult =
  | {
      ok: true
      path: string
      content: string
      truncated: boolean
    }
  | {
      ok: false
      error: string
    }

export type TerminalRunResult = {
  output: string
}

export type TerminalOutputEvent = {
  workspaceId: string
  chunk: string
  stream: 'stdout' | 'stderr'
}

export type WorkspacesPayload = {
  list: WorkspaceInfo[]
  activeWorkspaceId: string | null
}

export type SessionInfo = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

export type MessageRole = 'user' | 'assistant' | 'system'

export type ChatMessage = {
  /** 消息组 ID */
  id: string
  role: MessageRole
  content: string
  /**
   * 本轮 AG-UI 时间线相关事件快照。
   * 仅用于 UI 恢复。
   */
  aguiEvents?: BaseEvent[]
}

/** 技能列表项 — 渲染层斜杠菜单 */
export type SkillListItem = {
  name: string
  description: string
  source: string
}
