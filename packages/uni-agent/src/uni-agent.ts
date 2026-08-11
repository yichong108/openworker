/**
 * UniAgent — 统一 AG-UI AbstractAgent。
 *
 * 宿主传入统一配置；内部委托 OpenWorker 后端。
 */

import {
  AbstractAgent,
  type AgentConfig,
  type BaseEvent,
  type RunAgentInput,
  type RunAgentParameters
} from '@ag-ui/client'
import { OpenWorkerAgent, type AgentMcp, type OpenWorkerAgentRunDefaults } from '@openworker/agent'
import type { LanguageModel } from 'ai'
import { Observable } from 'rxjs'

/** 统一 run 转发参数 */
export type UniAgentRunDefaults = OpenWorkerAgentRunDefaults

/**
 * UniAgent 配置：AG-UI AgentConfig + OpenWorker 后端字段。
 */
export type UniAgentConfig = AgentConfig & {
  /**
   * 角色：
   * - session（默认）：会话对话；dispose 为 no-op（避免误清进程级 MCP 池）
   * - mcp-host：MCP 预热/探测宿主；dispose 会释放 MCP 连接池
   */
  role?: 'session' | 'mcp-host'
  /** 工作区根目录 */
  cwd?: string
  /** 对话模型（可在 create 占位，run 时经 forwardedProps.provider 覆盖） */
  provider?: LanguageModel | null
  runDefaults?: UniAgentRunDefaults
}

/** 宿主组装本轮 run 参数时的统一输入 */
export type UniAgentRunInput = {
  composerMode?: OpenWorkerAgentRunDefaults['composerMode']
  abortController?: AbortController
  workspacePath?: string
  terminalKey?: string
  provider?: LanguageModel | null
  tavilyApiKey?: string
  maxSteps?: number
  invokeTimeoutMs?: number
  /** 会话记忆压缩段落 */
  memorySystemSection?: string
}

/** 创建时占位模型 */
const PLACEHOLDER_PROVIDER = { modelId: 'uni-agent-placeholder' } as LanguageModel

/**
 * 在 AG-UI structuredClone 前剥离不可克隆字段（provider / abortController）。
 *
 * @param forwarded - 原始 forwardedProps
 * @returns cloneable 与 extras
 */
function detachNonCloneableForwardedProps(forwarded: unknown): {
  cloneable: Record<string, unknown>
  extras: Record<string, unknown>
} {
  if (!forwarded || typeof forwarded !== 'object') {
    return { cloneable: {}, extras: {} }
  }

  const cloneable = { ...(forwarded as Record<string, unknown>) }
  const extras: Record<string, unknown> = {}

  if ('provider' in cloneable && cloneable.provider != null) {
    extras.provider = cloneable.provider
    delete cloneable.provider
  }

  if (cloneable.abortController instanceof AbortController) {
    extras.abortController = cloneable.abortController
    delete cloneable.abortController
  } else if ('abortController' in cloneable) {
    delete cloneable.abortController
  }

  return { cloneable, extras }
}

/**
 * 统一 AG-UI Agent：实现 AbstractAgent 协议，内部委托 OpenWorker 后端。
 *
 * 宿主契约：
 * - `run(input): Observable<BaseEvent>`
 * - `runAgent()` / `subscribe()` / `abortRun()` / `clone()` / `dispose()`
 * - `buildRunForwardedProps()` / `assertReady()` — 统一组装本轮参数
 */
export class UniAgent extends AbstractAgent {
  /** CopilotKit Runtime 可能注入的 per-request headers */
  public headers?: Record<string, string>

  private readonly config: UniAgentConfig
  private readonly backend: OpenWorkerAgent
  private readonly role: 'session' | 'mcp-host'
  private pendingForwardedExtras: Record<string, unknown> = {}

  /**
   * 创建统一 AG-UI Agent。
   *
   * @param config - UniAgent 配置
   */
  constructor(config: UniAgentConfig) {
    const { role, cwd: _cwd, provider: _p, runDefaults: _rd, ...agui } = config
    super(agui)
    this.config = config
    this.role = role ?? 'session'
    this.backend = this.createBackend(config)
  }

  /**
   * MCP 宿主能力（probe / warmup / dispose）。
   */
  public get mcp(): AgentMcp {
    return this.backend.mcp
  }

  /**
   * 校验当前后端是否具备开跑条件（密钥等）。
   *
   * @param options - 本轮可用的 provider
   * @throws 缺少必要凭据时抛出 Error
   */
  public assertReady(options?: { provider?: LanguageModel | null }): void {
    const provider = options?.provider ?? this.config.provider
    if (!provider) {
      throw new Error('请先在设置中配置 API Key')
    }
  }

  /**
   * 组装本轮 forwardedProps。
   *
   * @param input - 统一 run 参数
   * @returns 可交给 runAgent({ forwardedProps }) 的对象
   */
  public buildRunForwardedProps(input: UniAgentRunInput): UniAgentRunDefaults {
    return {
      composerMode: input.composerMode,
      abortController: input.abortController,
      workspacePath: input.workspacePath,
      provider: input.provider ?? this.config.provider ?? undefined,
      terminalKey: input.terminalKey,
      tavily: input.tavilyApiKey != null ? { apiKey: input.tavilyApiKey } : undefined,
      maxSteps: input.maxSteps,
      invokeTimeoutMs: input.invokeTimeoutMs,
      ...(input.memorySystemSection != null
        ? { memorySystemSection: input.memorySystemSection }
        : {})
    }
  }

  /**
   * 克隆当前 UniAgent（新后端实例，复制 AG-UI 消息与 state）。
   *
   * @returns 新的 UniAgent
   */
  public clone(): UniAgent {
    const cloned = new UniAgent({
      ...this.config,
      threadId: this.threadId,
      initialMessages: structuredClone(this.messages),
      initialState: structuredClone(this.state)
    })
    if (this.headers) {
      cloned.headers = { ...this.headers }
    }
    return cloned
  }

  /**
   * 取消当前进行中的 run。
   */
  public abortRun(): void {
    this.backend.abortRun()
    super.abortRun()
  }

  /**
   * 释放后端资源。
   *
   * - mcp-host：释放 OpenWorker MCP 连接池
   * - session：no-op（避免误清进程级 MCP 池）
   */
  public async dispose(): Promise<void> {
    if (this.role === 'mcp-host') {
      await this.backend.dispose()
    }
  }

  /**
   * 组装 RunAgentInput：剥离不可克隆的 forwardedProps。
   *
   * @param parameters - runAgent 入参
   * @returns 可安全克隆的 RunAgentInput
   */
  protected prepareRunAgentInput(parameters?: RunAgentParameters): RunAgentInput {
    const { cloneable, extras } = detachNonCloneableForwardedProps(parameters?.forwardedProps)
    this.pendingForwardedExtras = extras
    return super.prepareRunAgentInput({
      ...parameters,
      forwardedProps: cloneable
    })
  }

  /**
   * 按 AG-UI 协议执行一轮：将外层 messages 灌入后端后委托 `run`。
   *
   * 本轮 assistant 正文由外层 AbstractAgent.apply 根据事件流累加到 this.messages；
   * 结束后不要用 backend.messages 回写覆盖。
   *
   * @param input - AG-UI RunAgentInput
   * @returns BaseEvent 流
   */
  public run(input: RunAgentInput): Observable<BaseEvent> {
    this.backend.messages = [...this.messages]

    const mergedForwarded = {
      ...this.pendingForwardedExtras,
      ...(input.forwardedProps && typeof input.forwardedProps === 'object'
        ? (input.forwardedProps as Record<string, unknown>)
        : {})
    }

    const backendInput: RunAgentInput = {
      ...input,
      messages: this.backend.messages,
      forwardedProps: { ...mergedForwarded }
    }

    return new Observable<BaseEvent>((subscriber) => {
      const subscription = this.backend.run(backendInput).subscribe({
        next: (event) => {
          if (!subscriber.closed) subscriber.next(event)
        },
        error: (err) => {
          // 外层 AbstractAgent.apply 已根据 TEXT_MESSAGE_* 更新 this.messages；
          // 后端并不维护完整 AG-UI messages，禁止用 backend.messages 覆盖以免冲掉本轮正文。
          this.pendingForwardedExtras = {}
          if (!subscriber.closed) subscriber.error(err)
        },
        complete: () => {
          this.pendingForwardedExtras = {}
          if (!subscriber.closed) subscriber.complete()
        }
      })

      return () => {
        subscription.unsubscribe()
        this.pendingForwardedExtras = {}
      }
    })
  }

  /**
   * 创建底层 OpenWorker AG-UI 后端实例。
   *
   * @param config - UniAgentConfig
   * @returns OpenWorkerAgent
   */
  private createBackend(config: UniAgentConfig): OpenWorkerAgent {
    const cwd = config.cwd?.trim() || undefined
    const common = {
      ...(config.threadId ? { threadId: config.threadId } : {}),
      ...(config.initialMessages ? { initialMessages: config.initialMessages } : {}),
      ...(config.initialState != null ? { initialState: config.initialState } : {})
    }

    return new OpenWorkerAgent({
      agentId: config.agentId ?? 'uni-openworker',
      description: config.description ?? 'OpenWorker uni ReAct agent',
      ...common,
      agent: {
        provider: config.provider ?? PLACEHOLDER_PROVIDER,
        ...(cwd ? { local: { cwd } } : {})
      },
      ...(config.runDefaults
        ? { runDefaults: config.runDefaults as OpenWorkerAgentRunDefaults }
        : {})
    })
  }
}
