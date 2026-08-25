import { EventType, type BaseEvent } from '@ag-ui/client'

import type { ChatComposerSkill, ChatSessionMessage } from '../src/chat-session/types.js'

const T0 = 1_720_000_000_000

/**
 * 构造一条 AG-UI 时间线源事件（playground 模拟数据）。
 *
 * @param event - 部分字段的事件对象
 */
function ev(event: Record<string, unknown>): BaseEvent {
  return event as unknown as BaseEvent
}

/** 斜杠技能菜单模拟数据 */
export const MOCK_SKILLS: ChatComposerSkill[] = [
  { name: 'refactor', description: '对选中代码做行为保持的重构', source: 'user' },
  { name: 'review', description: '审查变更并列出风险点', source: 'user' },
  { name: 'test', description: '为当前改动补充测试', source: 'user' }
]

const historyAssistantEvents: BaseEvent[] = [
  ev({
    type: EventType.CUSTOM,
    name: 'cursor.thinking',
    value: {
      text: '先看现有 ChatSession 入参，再决定用哪些 AG-UI 事件铺一条完整回合。',
      thinkingDurationMs: 1800
    },
    timestamp: T0 + 400
  }),
  ev({
    type: EventType.TOOL_CALL_START,
    toolCallId: 'tc-grep',
    toolCallName: 'grep',
    timestamp: T0 + 800
  }),
  ev({
    type: EventType.TOOL_CALL_ARGS,
    toolCallId: 'tc-grep',
    delta: JSON.stringify({ pattern: 'ChatSessionView' }),
    timestamp: T0 + 820
  }),
  ev({
    type: EventType.TOOL_CALL_RESULT,
    toolCallId: 'tc-grep',
    content: 'packages/ui/src/chat-session/ChatSessionView.tsx',
    timestamp: T0 + 1100
  }),
  ev({
    type: EventType.TOOL_CALL_START,
    toolCallId: 'tc-read',
    toolCallName: 'read_file',
    timestamp: T0 + 1200
  }),
  ev({
    type: EventType.TOOL_CALL_ARGS,
    toolCallId: 'tc-read',
    delta: JSON.stringify({ path: 'packages/ui/src/chat-session/types.ts' }),
    timestamp: T0 + 1220
  }),
  ev({
    type: EventType.TOOL_CALL_RESULT,
    toolCallId: 'tc-read',
    content: 'export type ChatSessionViewProps = { ... }',
    timestamp: T0 + 1600
  }),
  ev({
    type: EventType.TOOL_CALL_START,
    toolCallId: 'tc-write',
    toolCallName: 'write_file',
    timestamp: T0 + 1800
  }),
  ev({
    type: EventType.TOOL_CALL_ARGS,
    toolCallId: 'tc-write',
    delta: JSON.stringify({
      path: 'packages/ui/playground/mock-session.ts',
      content: 'export const MOCK_HISTORY_MESSAGES = []\n'
    }),
    timestamp: T0 + 1820
  }),
  ev({
    type: EventType.TOOL_CALL_RESULT,
    toolCallId: 'tc-write',
    content: JSON.stringify({
      path: 'packages/ui/playground/mock-session.ts',
      before: '',
      after: 'export const MOCK_HISTORY_MESSAGES = []\n',
      created: true
    }),
    timestamp: T0 + 2200
  })
]

/** 已完成的两回合会话（含 Worked 时间线与 Markdown） */
export const MOCK_HISTORY_MESSAGES: ChatSessionMessage[] = [
  {
    id: 'u1',
    role: 'user',
    content: '帮我看一下 ChatSession 视图抽出来之后长什么样，顺手补一条带工具过程的示例。'
  },
  {
    id: 'a1',
    role: 'assistant',
    content: [
      '已经用模拟 AG-UI 事件铺了一条完整回合，你可以：',
      '',
      '1. 展开上方 **已工作** 看 Thought / Explored / Edit',
      '2. 点用户气泡进入就地编辑',
      '3. 输入 `/` 打开技能菜单',
      '',
      '外链确认也可以点：[OpenWorker](https://example.com)'
    ].join('\n'),
    aguiEvents: historyAssistantEvents
  },
  {
    id: 'u2',
    role: 'user',
    content: '计划卡片和流式打字机也要能看到。'
  },
  {
    id: 'a2',
    role: 'assistant',
    content: '顶部切换「流式输出」或「计划卡片」即可。发送按钮会追加一条用户消息，并模拟助手回复。'
  }
]

const streamingLiveEvents: BaseEvent[] = [
  ev({
    type: EventType.CUSTOM,
    name: 'cursor.thinking',
    value: { text: '按宿主递增 content 的方式模拟打字机。', thinkingDurationMs: 900 },
    timestamp: T0 + 10_000
  }),
  ev({
    type: EventType.TOOL_CALL_START,
    toolCallId: 'tc-list',
    toolCallName: 'list_dir',
    timestamp: T0 + 10_400
  }),
  ev({
    type: EventType.TOOL_CALL_ARGS,
    toolCallId: 'tc-list',
    delta: JSON.stringify({ path: 'packages/ui/src/chat-session' }),
    timestamp: T0 + 10_420
  })
]

/** 流式场景：最新 assistant 仍在输出 */
export const MOCK_STREAMING_MESSAGES: ChatSessionMessage[] = [
  {
    id: 'su1',
    role: 'user',
    content: '用模拟数据把流式过程条跑起来。'
  },
  {
    id: 'sa1',
    role: 'assistant',
    content: '正在读取 `chat-session` 目录',
    streaming: true
  }
]

/** 流式场景的直播 AG-UI 事件 */
export const MOCK_STREAMING_LIVE_EVENTS: BaseEvent[] = streamingLiveEvents

/** 流式正文后续会逐字追加的稿件 */
export const MOCK_STREAM_TAIL =
  '，并往 Worked 时间线里塞 list_dir。宿主只要持续改 `content` 和 `liveEvents`，视图就会跟着刷新。'

/** 计划卡初始 Markdown */
export const MOCK_PLAN_MARKDOWN = [
  '# 预览 ChatSession',
  '',
  '- 空会话：居中输入框',
  '- 历史：Worked + Markdown + 用户编辑',
  '- 流式：`isRun` + liveEvents',
  '- 计划：本卡片可编辑后点「开始构建」'
].join('\n')

export type PlaygroundScene = 'empty' | 'loading' | 'history' | 'streaming' | 'plan'

export const PLAYGROUND_SCENES: { id: PlaygroundScene; label: string }[] = [
  { id: 'empty', label: '空会话' },
  { id: 'loading', label: '加载中' },
  { id: 'history', label: '历史会话' },
  { id: 'streaming', label: '流式输出' },
  { id: 'plan', label: '计划卡片' }
]
