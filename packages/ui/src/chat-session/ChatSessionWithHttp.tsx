import type { BaseEvent } from '@ag-ui/client'
import type { AgentComposerMode } from '@openworker/shared'
import { App as AntdApp } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  applyAguiEvent,
  emptyLiveSession,
  finalizeLiveSession,
  nextMessageId,
  restoreUnansweredUserInput,
  type LiveAgentSession
} from './apply-agui-event.js'
import { ChatSessionView } from './ChatSessionView.js'
import {
  applySkillSlashSelection,
  filterSkillsByQuery,
  findActiveSlashSkillToken,
  type SlashSkillToken
} from './composer-slash-skills.js'
import type { ChatComposerSkill, ChatSessionMessage, ChatSessionWithHttpProps } from './types.js'

function toRunMessages(messages: ChatSessionMessage[]) {
  return messages
    .filter((item) => item.role === 'user' || item.role === 'assistant')
    .filter((item) => item.content.trim())
    .map((item) => ({
      id: item.id,
      role: item.role as 'user' | 'assistant',
      content: item.content
    }))
}

function buildInitialSession(
  props: Pick<
    ChatSessionWithHttpProps,
    'initialMessages' | 'initialLiveEvents' | 'initialIsRun' | 'initialRunStats'
  >
): LiveAgentSession {
  return {
    ...emptyLiveSession(),
    messages: props.initialMessages ?? [],
    liveEvents: props.initialLiveEvents ?? [],
    isRun: props.initialIsRun ?? false,
    runStats: props.initialRunStats
  }
}

function isAguiEvent(event: unknown): event is BaseEvent {
  return Boolean(event && typeof event === 'object' && 'type' in event)
}

/**
 * 自包含聊天会话：内部管 AG-UI 事件与会话状态，run/stop 由宿主回调实现。
 *
 * 流式事件由宿主在 `onRunRequest` 内消费并回调 `onEvent`。
 * `initialIsRun` 时挂载后自动 `onRunRequest({ reconnect: true })` 补订流。
 *
 * @param props - onRunRequest / onStopRequest
 */
export function ChatSessionWithHttp({
  onRunRequest,
  onStopRequest,
  loadSkills,
  sessionKey = 'http-session',
  className,
  initialMessages,
  initialLiveEvents,
  initialIsRun,
  initialRunStats
}: ChatSessionWithHttpProps) {
  const { message: msgApi } = AntdApp.useApp()
  const loadSkillsRef = useRef(loadSkills)
  loadSkillsRef.current = loadSkills
  const initialSession = buildInitialSession({
    initialMessages,
    initialLiveEvents,
    initialIsRun,
    initialRunStats
  })
  const [input, setInput] = useState('')
  const [composerMode, setComposerMode] = useState<AgentComposerMode>('build')
  const [messages, setMessages] = useState<ChatSessionMessage[]>(initialSession.messages)
  const [liveEvents, setLiveEvents] = useState(initialSession.liveEvents)
  const [isRun, setIsRun] = useState(initialSession.isRun)
  const [runStats, setRunStats] = useState(initialSession.runStats)
  const [skills, setSkills] = useState<ChatComposerSkill[]>([])
  const [skillsLoading, setSkillsLoading] = useState(false)
  const [slashToken, setSlashToken] = useState<SlashSkillToken | null>(null)
  const [skillMenuActiveIndex, setSkillMenuActiveIndex] = useState(0)
  const skillsLoadedRef = useRef(false)
  const skillsFetchGenRef = useRef(0)
  const sessionRef = useRef<LiveAgentSession>(initialSession)
  const abortRef = useRef<AbortController | null>(null)
  const onRunRequestRef = useRef(onRunRequest)
  onRunRequestRef.current = onRunRequest

  const filteredSkills = useMemo(
    () => (slashToken && loadSkills ? filterSkillsByQuery(skills, slashToken.query) : []),
    [loadSkills, skills, slashToken]
  )

  const ensureSkillsLoaded = useCallback(async () => {
    const load = loadSkillsRef.current
    if (!load || skillsLoadedRef.current) return
    const gen = ++skillsFetchGenRef.current
    setSkillsLoading(true)
    try {
      const list = await load()
      if (gen !== skillsFetchGenRef.current) return
      setSkills(Array.isArray(list) ? list : [])
      skillsLoadedRef.current = true
    } catch {
      if (gen !== skillsFetchGenRef.current) return
      setSkills([])
    } finally {
      if (gen === skillsFetchGenRef.current) {
        setSkillsLoading(false)
      }
    }
  }, [])

  const syncSlashSkillMenu = useCallback((text: string, cursor?: number) => {
    if (!loadSkillsRef.current) return
    const pos = cursor ?? text.length
    setSlashToken(findActiveSlashSkillToken(text, pos))
  }, [])

  const selectSkill = useCallback(
    (skill: ChatComposerSkill) => {
      if (!slashToken) return
      const { nextText } = applySkillSlashSelection(input, slashToken, skill.name)
      setInput(nextText)
      setSlashToken(null)
    },
    [input, slashToken]
  )

  useEffect(() => {
    if (!slashToken) {
      skillsLoadedRef.current = false
      return
    }
    setSkillMenuActiveIndex(0)
  }, [slashToken?.query, slashToken])

  useEffect(() => {
    if (!slashToken || !loadSkills) return
    void ensureSkillsLoaded()
  }, [ensureSkillsLoaded, loadSkills, slashToken])

  useEffect(() => {
    if (skillMenuActiveIndex < filteredSkills.length) return
    setSkillMenuActiveIndex(filteredSkills.length > 0 ? filteredSkills.length - 1 : 0)
  }, [filteredSkills.length, skillMenuActiveIndex])

  const flush = useCallback((next: LiveAgentSession) => {
    sessionRef.current = next
    setMessages(next.messages)
    setLiveEvents(next.liveEvents)
    setIsRun(next.isRun)
    setRunStats(next.runStats)
  }, [])

  const applyAguiEventToSession = useCallback(
    (event: BaseEvent) => {
      flush(applyAguiEvent(sessionRef.current, event))
    },
    [flush]
  )

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    if (!initialIsRun) return
    const abort = new AbortController()
    abortRef.current = abort
    void Promise.resolve(
      onRunRequestRef.current({
        reconnect: true,
        text: '',
        messages: toRunMessages(sessionRef.current.messages),
        signal: abort.signal,
        onEvent: (event) => {
          if (!isAguiEvent(event)) return
          applyAguiEventToSession(event)
        }
      })
    ).catch((error) => {
      if (abort.signal.aborted) return
      msgApi.error(error instanceof Error ? error.message : String(error))
      flush(finalizeLiveSession(sessionRef.current))
    })
    return () => {
      abort.abort()
    }
  }, [applyAguiEventToSession, flush, initialIsRun, msgApi, sessionKey])

  const applyStopToSession = useCallback(() => {
    const finalized = finalizeLiveSession(sessionRef.current)
    const { session, restoredInput } = restoreUnansweredUserInput(finalized)
    if (restoredInput !== undefined) setInput(restoredInput)
    flush(session)
  }, [flush])

  const runSession = useCallback(
    async (history: ChatSessionMessage[], text: string, editMessageId?: string) => {
      abortRef.current?.abort()
      const abort = new AbortController()
      abortRef.current = abort
      flush({ ...sessionRef.current, messages: history, isRun: true, liveEvents: [] })

      try {
        await onRunRequest({
          text,
          editMessageId,
          messages: toRunMessages(history),
          signal: abort.signal,
          onEvent: (event) => {
            if (!isAguiEvent(event)) return
            applyAguiEventToSession(event)
          }
        })
        if (sessionRef.current.isRun) {
          flush(finalizeLiveSession(sessionRef.current))
        }
      } catch (error) {
        if (abort.signal.aborted) {
          applyStopToSession()
          return
        }
        msgApi.error(error instanceof Error ? error.message : String(error))
        flush(finalizeLiveSession(sessionRef.current))
      }
    },
    [applyAguiEventToSession, applyStopToSession, flush, msgApi, onRunRequest]
  )

  const send = useCallback(() => {
    const text = input.trim()
    if (!text || isRun) return
    const user: ChatSessionMessage = { id: nextMessageId('u'), role: 'user', content: text }
    setInput('')
    setSlashToken(null)
    void runSession([...sessionRef.current.messages, user], text)
  }, [input, isRun, runSession])

  const stopRun = useCallback(() => {
    abortRef.current?.abort()
    void Promise.resolve(onStopRequest()).then((result) => {
      if (result && 'restoredInput' in result && result.restoredInput) {
        setInput(result.restoredInput)
      }
    })
    applyStopToSession()
  }, [applyStopToSession, onStopRequest])

  return (
    <ChatSessionView
      className={className}
      isLoading={false}
      isEmpty={messages.length === 0 && !isRun}
      messages={messages}
      liveEvents={liveEvents}
      isRun={isRun}
      runStats={runStats}
      sessionKey={sessionKey}
      onStopRun={stopRun}
      onEditResend={(messageId, text) => {
        const trimmed = text.trim()
        if (!trimmed || isRun) return
        const idx = sessionRef.current.messages.findIndex((item) => item.id === messageId)
        if (idx < 0 || sessionRef.current.messages[idx]?.role !== 'user') return
        const history = [
          ...sessionRef.current.messages.slice(0, idx),
          { ...sessionRef.current.messages[idx]!, content: trimmed, aguiEvents: undefined }
        ]
        void runSession(history, trimmed, messageId)
      }}
      onOpenExternal={async (href) => {
        window.open(href, '_blank', 'noopener,noreferrer')
        return { ok: true }
      }}
      composer={{
        value: input,
        onChange: (value, cursor) => {
          setInput(value)
          syncSlashSkillMenu(value, cursor)
        },
        onSend: send,
        canSend: input.trim().length > 0,
        composerMode,
        onComposerModeChange: setComposerMode,
        ...(loadSkills
          ? {
              skillMenu: {
                open: slashToken != null,
                skills: filteredSkills,
                activeIndex: skillMenuActiveIndex,
                loading: skillsLoading,
                onSelect: selectSkill,
                onActiveIndexChange: setSkillMenuActiveIndex,
                onClose: () => setSlashToken(null)
              }
            }
          : {})
      }}
    />
  )
}
