import type { AgentComposerMode } from '@openworker/shared'
import { App as AntdApp, Segmented } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ChatSessionView } from '../src/index.js'
import type { ChatComposerSkill, ChatSessionMessage } from '../src/chat-session/types.js'
import {
  MOCK_HISTORY_MESSAGES,
  MOCK_PLAN_MARKDOWN,
  MOCK_SKILLS,
  MOCK_STREAM_TAIL,
  MOCK_STREAMING_LIVE_EVENTS,
  MOCK_STREAMING_MESSAGES,
  PLAYGROUND_SCENES,
  type PlaygroundScene
} from './mock-session'

type SlashToken = { start: number; end: number; query: string }

/**
 * 解析输入框中活跃的 `/技能` token（playground 宿主侧，对齐 desktop 规则）。
 *
 * @param text - 输入全文
 * @param cursor - 光标位置
 */
function findSlashToken(text: string, cursor: number): SlashToken | null {
  if (cursor < 1 || cursor > text.length) return null
  const before = text.slice(0, cursor)
  const match = /(?:^|[\s\n])(\/([^\s/]*))$/.exec(before)
  if (!match) return null
  const token = match[1]
  const query = match[2] ?? ''
  const start = cursor - token.length
  return { start, end: cursor, query }
}

/**
 * 按 query 过滤技能列表。
 *
 * @param skills - 技能
 * @param query - `/` 后的过滤串
 */
function filterSkills(skills: ChatComposerSkill[], query: string): ChatComposerSkill[] {
  const q = query.trim().toLowerCase()
  if (!q) return skills
  return skills.filter(
    (item) => item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)
  )
}

function nextId(prefix: string): string {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`
}

/**
 * ChatSessionView 预览宿主：切换场景并用模拟数据驱动列表、流式与输入框。
 */
export function PlaygroundApp() {
  const { message: msgApi } = AntdApp.useApp()
  const [scene, setScene] = useState<PlaygroundScene>('history')
  const [messages, setMessages] = useState<ChatSessionMessage[]>(MOCK_HISTORY_MESSAGES)
  const [input, setInput] = useState('')
  const [composerMode, setComposerMode] = useState<AgentComposerMode>('build')
  const [isRun, setIsRun] = useState(false)
  const [liveEvents, setLiveEvents] = useState(MOCK_STREAMING_LIVE_EVENTS)
  const [planMarkdown, setPlanMarkdown] = useState(MOCK_PLAN_MARKDOWN)
  const [slashToken, setSlashToken] = useState<SlashToken | null>(null)
  const [skillMenuActiveIndex, setSkillMenuActiveIndex] = useState(0)
  const streamTimerRef = useRef<number | null>(null)
  const streamStartedAtRef = useRef(T0_STREAM)

  const isLoading = scene === 'loading'
  const isEmpty = scene === 'empty' && messages.length === 0
  const showPlan = scene === 'plan'

  const filteredSkills = useMemo(
    () => (slashToken ? filterSkills(MOCK_SKILLS, slashToken.query) : []),
    [slashToken]
  )

  const applyScene = useCallback((next: PlaygroundScene) => {
    if (streamTimerRef.current != null) {
      window.clearInterval(streamTimerRef.current)
      streamTimerRef.current = null
    }
    setScene(next)
    setInput('')
    setSlashToken(null)
    setComposerMode('build')
    setPlanMarkdown(MOCK_PLAN_MARKDOWN)
    if (next === 'empty') {
      setMessages([])
      setIsRun(false)
      setLiveEvents([])
      return
    }
    if (next === 'loading') {
      setMessages([])
      setIsRun(false)
      setLiveEvents([])
      return
    }
    if (next === 'streaming') {
      setMessages(MOCK_STREAMING_MESSAGES)
      setIsRun(true)
      setLiveEvents(MOCK_STREAMING_LIVE_EVENTS)
      streamStartedAtRef.current = Date.now() - 4000
      return
    }
    setMessages(MOCK_HISTORY_MESSAGES)
    setIsRun(false)
    setLiveEvents([])
  }, [])

  useEffect(() => {
    if (scene !== 'streaming' || !isRun) return
    let i = 0
    streamTimerRef.current = window.setInterval(() => {
      i += 1
      const slice = MOCK_STREAM_TAIL.slice(0, i)
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (!last || last.role !== 'assistant') return prev
        const next = [...prev]
        next[next.length - 1] = {
          ...last,
          content: `正在读取 \`chat-session\` 目录${slice}`
        }
        return next
      })
      if (i >= MOCK_STREAM_TAIL.length) {
        if (streamTimerRef.current != null) window.clearInterval(streamTimerRef.current)
        streamTimerRef.current = null
        setIsRun(false)
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (!last) return prev
          const next = [...prev]
          next[next.length - 1] = { ...last, streaming: false }
          return next
        })
      }
    }, 42)
    return () => {
      if (streamTimerRef.current != null) window.clearInterval(streamTimerRef.current)
    }
  }, [scene, isRun])

  const syncSlash = useCallback((text: string, cursor?: number) => {
    const pos = cursor ?? text.length
    const token = findSlashToken(text, pos)
    setSlashToken(token)
    setSkillMenuActiveIndex(0)
  }, [])

  const selectSkill = useCallback(
    (skill: ChatComposerSkill) => {
      if (!slashToken) return
      const insertion = `/${skill.name} `
      const nextText = input.slice(0, slashToken.start) + insertion + input.slice(slashToken.end)
      setInput(nextText)
      setSlashToken(null)
    },
    [input, slashToken]
  )

  const send = useCallback(() => {
    const text = input.trim()
    if (!text || isRun) return
    const user: ChatSessionMessage = {
      id: nextId('u'),
      role: 'user',
      content: text
    }
    const assistant: ChatSessionMessage = {
      id: nextId('a'),
      role: 'assistant',
      content: `已收到：${text}\n\n这是 playground 的模拟回复，不走真实 Agent。`
    }
    setMessages((prev) => [...prev, user, assistant])
    setInput('')
    setSlashToken(null)
    if (scene === 'empty') setScene('history')
    msgApi.success('已用模拟数据追加一轮对话')
  }, [input, isRun, msgApi, scene])

  const stopRun = useCallback(() => {
    setIsRun(false)
    if (streamTimerRef.current != null) {
      window.clearInterval(streamTimerRef.current)
      streamTimerRef.current = null
    }
    msgApi.info('已停止模拟流式')
  }, [msgApi])

  return (
    <div className="ow-ui-playground">
      <header className="ow-ui-playground-bar">
        <span className="ow-ui-playground-title">ChatSession 预览</span>
        <Segmented
          size="small"
          value={scene}
          onChange={(value) => applyScene(value as PlaygroundScene)}
          options={PLAYGROUND_SCENES.map((item) => ({
            label: item.label,
            value: item.id
          }))}
        />
        <span className="ow-ui-playground-hint">500×600 · 模拟数据 · 输入 / 可打开技能菜单</span>
      </header>
      <div className="ow-ui-playground-stage app-shell">
        <ChatSessionView
          isLoading={isLoading}
          isEmpty={isEmpty}
          messages={messages}
          liveEvents={liveEvents}
          isRun={isRun}
          runStats={
            scene === 'streaming'
              ? {
                  startedAt: streamStartedAtRef.current,
                  runId: 'play-run',
                  traceId: 'play-trace'
                }
              : { durationMs: 4200 }
          }
          sessionKey={scene}
          onStopRun={stopRun}
          onEditResend={(messageId, text) => {
            setMessages((prev) => {
              const idx = prev.findIndex((m) => m.id === messageId)
              if (idx < 0) return prev
              return [
                ...prev.slice(0, idx),
                { ...prev[idx]!, content: text },
                {
                  id: nextId('a'),
                  role: 'assistant',
                  content: `已按编辑后的提示重跑（模拟）：${text}`
                }
              ]
            })
            msgApi.success('已模拟编辑重发')
          }}
          onOpenExternal={async (href) => {
            window.open(href, '_blank', 'noopener,noreferrer')
            return { ok: true }
          }}
          emptyToolbar={
            <div className="app-composer-toolbar">
              <button type="button" className="app-composer-workspace-trigger">
                <span className="app-composer-workspace-trigger-body">
                  <span className="app-composer-workspace-name">预览工作区</span>
                </span>
              </button>
            </div>
          }
          plan={
            showPlan
              ? {
                  title: 'ChatSession 预览计划',
                  markdown: planMarkdown,
                  onMarkdownChange: setPlanMarkdown,
                  onSave: () => msgApi.success('模拟保存到工作区'),
                  onBuild: () => msgApi.success('模拟开始构建'),
                  buildDisabled: isRun
                }
              : null
          }
          composer={{
            value: input,
            onChange: (value, cursor) => {
              setInput(value)
              syncSlash(value, cursor)
            },
            onSend: send,
            canSend: input.trim().length > 0,
            composerMode,
            onComposerModeChange: setComposerMode,
            skillMenu: {
              open: slashToken != null,
              skills: filteredSkills,
              activeIndex: skillMenuActiveIndex,
              onSelect: selectSkill,
              onActiveIndexChange: setSkillMenuActiveIndex,
              onClose: () => setSlashToken(null)
            }
          }}
        />
      </div>
    </div>
  )
}

const T0_STREAM = Date.now() - 4000
