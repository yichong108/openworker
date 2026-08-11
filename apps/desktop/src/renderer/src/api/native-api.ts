/**
 * Renderer → Native HTTP/SSE 客户端（工作区 / 会话 / Agent / settings / skills / MCP / 终端）
 */

import type { Message } from '@ag-ui/client'
import type {
  AgentSendOptions,
  AppSettings,
  CreateWorkspaceRequest,
  McpServerEntry,
  SessionDto,
  WorkspaceDto
} from '@openworker/shared'

import { aguiMessagesToChatMessages } from '@/renderer/src/api/agui-messages'
import {
  getRequestErrorMessage,
  request,
  requestDataEnvelope,
  type RequestResult
} from '@/renderer/src/api/request'
import { postSse } from '@/renderer/src/api/sse'
import type {
  AgentStreamPayload,
  ChatMessage,
  McpProbeResult,
  McpWarmupReport,
  McpWarmupStatus,
  SessionInfo,
  SkillListItem,
  TerminalOutputEvent,
  WorkspaceInfo
} from '@/shared/ipc'

/**
 * 将 WorkspaceDto 映射为渲染层 WorkspaceInfo。
 *
 * @param dto - Native DTO
 */
export function toWorkspaceInfo(dto: WorkspaceDto): WorkspaceInfo {
  return {
    id: dto.id,
    name: dto.name,
    path: dto.path,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    ...(dto.isDefault != null ? { isDefault: dto.isDefault } : {})
  }
}

/**
 * 将 SessionDto 映射为渲染层 SessionInfo。
 *
 * @param dto - Native DTO
 */
export function toSessionInfo(dto: SessionDto): SessionInfo {
  return {
    id: dto.id,
    name: dto.name,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt
  }
}

/**
 * 解包 RequestResult；失败抛 Error。
 *
 * @param result - 请求结果
 */
function unwrap<T>(result: RequestResult<T>): T {
  if (!result.ok) {
    throw new Error(getRequestErrorMessage(result))
  }
  return result.data
}

/**
 * 列出工作区。
 *
 * @returns WorkspaceInfo 列表
 */
export async function apiListWorkspaces(): Promise<WorkspaceInfo[]> {
  const data = unwrap(
    await request<{ list: WorkspaceDto[] }>({ method: 'GET', url: '/workspaces' })
  )
  return (data?.list ?? []).map(toWorkspaceInfo)
}

/**
 * 创建工作区。
 *
 * @param body - 创建请求
 */
export async function apiCreateWorkspace(body: CreateWorkspaceRequest): Promise<WorkspaceInfo> {
  const data = unwrap(
    await request<{ workspace: WorkspaceDto }>({ method: 'POST', url: '/workspaces', data: body })
  )
  return toWorkspaceInfo(data.workspace)
}

/**
 * 按路径 upsert 工作区（同 path 则复用，否则创建）。
 *
 * @param dir - 本机绝对路径
 */
export async function apiUpsertWorkspaceByPath(dir: string): Promise<WorkspaceInfo> {
  const path = dir.trim()
  const list = await apiListWorkspaces()
  const existing = list.find((w) => (w.path ?? '').trim() === path)
  if (existing) return existing
  const name = path.split(/[/\\]/).filter(Boolean).pop() || path
  return apiCreateWorkspace({ name, path })
}

/**
 * 重排工作区。
 *
 * @param orderedIds - 有序 id 列表
 */
export async function apiReorderWorkspaces(orderedIds: string[]): Promise<WorkspaceInfo[]> {
  const data = unwrap(
    await request<{ list: WorkspaceDto[] }>({
      method: 'PUT',
      url: '/workspaces/reorder',
      data: { orderedIds }
    })
  )
  return (data?.list ?? []).map(toWorkspaceInfo)
}

/**
 * 更新工作区。
 *
 * @param id - 工作区 id
 * @param patch - 补丁
 */
export async function apiPatchWorkspace(
  id: string,
  patch: { name?: string; path?: string | null; isDefault?: boolean }
): Promise<WorkspaceInfo> {
  const data = unwrap(
    await request<{ workspace: WorkspaceDto }>({
      method: 'PATCH',
      url: `/workspaces/${encodeURIComponent(id)}`,
      data: patch
    })
  )
  return toWorkspaceInfo(data.workspace)
}

/**
 * 软删工作区。
 *
 * @param id - 工作区 id
 */
export async function apiRemoveWorkspace(id: string): Promise<void> {
  unwrap(
    await request<{ ok: true }>({
      method: 'DELETE',
      url: `/workspaces/${encodeURIComponent(id)}`
    })
  )
}

/**
 * 列出工作区下会话。
 *
 * @param workspaceId - 工作区 id
 */
export async function apiListSessions(workspaceId: string): Promise<SessionInfo[]> {
  const data = unwrap(
    await request<{ list: SessionDto[] }>({
      method: 'GET',
      url: `/workspaces/${encodeURIComponent(workspaceId)}/sessions`
    })
  )
  return (data?.list ?? []).map(toSessionInfo)
}

/**
 * 创建会话。
 *
 * @param workspaceId - 工作区 id
 * @param name - 可选名称
 */
export async function apiCreateSession(workspaceId: string, name?: string): Promise<SessionInfo> {
  const data = unwrap(
    await request<{ session: SessionDto }>({
      method: 'POST',
      url: `/workspaces/${encodeURIComponent(workspaceId)}/sessions`,
      data: name ? { name } : {}
    })
  )
  return toSessionInfo(data.session)
}

/**
 * 重命名会话。
 *
 * @param id - 会话 id
 * @param name - 新名称
 */
export async function apiRenameSession(id: string, name: string): Promise<SessionInfo> {
  const data = unwrap(
    await request<{ session: SessionDto }>({
      method: 'PATCH',
      url: `/sessions/${encodeURIComponent(id)}`,
      data: { name }
    })
  )
  return toSessionInfo(data.session)
}

/**
 * 删除会话。
 *
 * @param id - 会话 id
 */
export async function apiDeleteSession(id: string): Promise<void> {
  unwrap(
    await request<{ ok: true }>({
      method: 'DELETE',
      url: `/sessions/${encodeURIComponent(id)}`
    })
  )
}

/**
 * 读取会话消息并转为 ChatMessage[]。
 *
 * @param sessionId - 会话 id
 */
export async function apiGetSessionChatMessages(sessionId: string): Promise<ChatMessage[]> {
  const data = unwrap(
    await request<{ messages: unknown[] }>({
      method: 'GET',
      url: `/sessions/${encodeURIComponent(sessionId)}/messages`
    })
  )
  return aguiMessagesToChatMessages((data?.messages ?? []) as Message[])
}

/**
 * 读取全局 settings。
 */
export async function apiGetSettings(): Promise<AppSettings> {
  return unwrap(await requestDataEnvelope<AppSettings>({ method: 'GET', url: '/settings' }))
}

/**
 * 合并更新 settings。
 *
 * @param patch - 部分 settings
 */
export async function apiSetSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  return unwrap(
    await requestDataEnvelope<AppSettings>({ method: 'PUT', url: '/settings', data: patch })
  )
}

/**
 * 列出用户 skills。
 */
export async function apiListSkills(): Promise<SkillListItem[]> {
  const data = unwrap(await request<{ skills: SkillListItem[] }>({ method: 'GET', url: '/skills' }))
  return data?.skills ?? []
}

/**
 * 探测 MCP 服务器。
 *
 * @param entry - MCP 配置
 */
export async function apiMcpProbe(entry: McpServerEntry): Promise<McpProbeResult> {
  return unwrap(await request<McpProbeResult>({ method: 'POST', url: '/mcp/probe', data: entry }))
}

/**
 * 读取 MCP 预热状态。
 */
export async function apiGetMcpWarmupStatus(): Promise<McpWarmupStatus> {
  return unwrap(await request<McpWarmupStatus>({ method: 'GET', url: '/mcp/warmup' }))
}

/**
 * 触发 MCP 预热。
 *
 * @param reset - 为 true 时重建宿主后再预热
 */
export async function apiRunMcpWarmup(reset: boolean = false): Promise<McpWarmupReport> {
  return unwrap(
    await request<McpWarmupReport>({
      method: 'POST',
      url: '/mcp/warmup',
      data: { reset }
    })
  )
}

/**
 * 取消会话 Agent run。
 *
 * @param sessionId - 会话 id
 */
export async function apiCancelAgent(sessionId: string): Promise<void> {
  unwrap(
    await request<{ ok: true }>({
      method: 'POST',
      url: `/sessions/${encodeURIComponent(sessionId)}/agent/cancel`
    })
  )
}

/**
 * 发送用户消息并订阅 AG-UI SSE。
 *
 * @param sessionId - 会话 id
 * @param text - 用户文本
 * @param opts - 发送选项
 * @param onStream - 流式事件回调
 * @param signal - 可选 AbortSignal
 */
export async function apiSendAgentMessage(
  sessionId: string,
  text: string,
  opts: AgentSendOptions | undefined,
  onStream: (payload: AgentStreamPayload) => void,
  signal?: AbortSignal
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await postSse(
      `/sessions/${encodeURIComponent(sessionId)}/agent/run`,
      {
        text,
        mode: opts?.mode,
        workspacePath: opts?.workspacePath,
        editUserOrdinal: opts?.editUserOrdinal
      },
      {
        onData: (data) => {
          if (data && typeof data === 'object' && 'sessionId' in data && 'event' in data) {
            onStream(data as AgentStreamPayload)
          }
        }
      },
      signal
    )
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * 取消右侧栏终端。
 *
 * @param workspaceId - 工作区 id
 */
export async function apiCancelTerminal(workspaceId: string): Promise<void> {
  unwrap(
    await request<{ ok: true }>({
      method: 'POST',
      url: '/terminal/cancel',
      data: { workspaceId }
    })
  )
}

/**
 * 终端补全。
 *
 * @param workspaceId - 工作区 id
 * @param commandLine - 当前命令行
 */
export async function apiCompleteTerminal(
  workspaceId: string,
  commandLine: string
): Promise<string[]> {
  const data = unwrap(
    await request<{ items: string[] }>({
      method: 'POST',
      url: '/terminal/complete',
      data: { workspaceId, commandLine }
    })
  )
  return data?.items ?? []
}

/**
 * 运行右侧栏终端（SSE 推送 chunk，结束时返回完整 output）。
 *
 * @param workspaceId - 工作区 id
 * @param command - 命令
 * @param onChunk - 实时输出
 * @param signal - 可选 AbortSignal
 */
export async function apiRunTerminal(
  workspaceId: string,
  command: string,
  onChunk?: (e: TerminalOutputEvent) => void,
  signal?: AbortSignal
): Promise<{ output: string }> {
  let output = ''
  await postSse(
    '/terminal/run',
    { workspaceId, command },
    {
      onEvent: (event, data) => {
        if (event === 'terminal' && data && typeof data === 'object') {
          const row = data as TerminalOutputEvent
          onChunk?.(row)
        }
        if (event === 'result' && data && typeof data === 'object' && 'output' in data) {
          output = String((data as { output: unknown }).output ?? '')
        }
      },
      onData: (data) => {
        // JSON 早退或无 event 名的 result：`{ output }`
        if (data && typeof data === 'object' && 'output' in data && !('chunk' in data)) {
          output = String((data as { output: unknown }).output ?? '')
        }
      }
    },
    signal
  )
  return { output }
}
