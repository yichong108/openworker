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

function toolTriple(
  id: string,
  name: string,
  args: unknown,
  result: string,
  start: number
): BaseEvent[] {
  return [
    ev({ type: EventType.TOOL_CALL_START, toolCallId: id, toolCallName: name, timestamp: start }),
    ev({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: id,
      delta: typeof args === 'string' ? args : JSON.stringify(args),
      timestamp: start + 20
    }),
    ev({
      type: EventType.TOOL_CALL_RESULT,
      toolCallId: id,
      content: result,
      timestamp: start + 280
    })
  ]
}

/** 斜杠技能菜单模拟数据 */
export const MOCK_SKILLS: ChatComposerSkill[] = [
  { name: 'refactor', description: '对选中代码做行为保持的重构，不新增功能', source: 'user' },
  { name: 'review', description: '审查变更并列出风险点、测试缺口与回归面', source: 'user' },
  { name: 'test', description: '为当前改动补充表征测试与边界用例', source: 'user' },
  { name: 'docs', description: '根据实现补一节简明说明，不写空话', source: 'user' },
  { name: 'plan', description: '先拆步骤再动手，适合不确定范围的任务', source: 'user' }
]

const FILE_AFTER = [
  "import type { ChatSessionMessage } from './types.js'",
  '',
  'export const MOCK_HISTORY_MESSAGES: ChatSessionMessage[] = [',
  "  { id: 'u1', role: 'user', content: '请展示长会话滚动。' },",
  "  { id: 'a1', role: 'assistant', content: '好的，下面用多回合模拟数据。' }",
  ']',
  ''
].join('\n')

const historyAssistantEvents: BaseEvent[] = [
  ev({
    type: EventType.CUSTOM,
    name: 'cursor.thinking',
    value: {
      text: '用户要看抽出后的 ChatSession 在窄容器里能不能滚。需要多回合、长 Markdown、以及一条带 Explored / Edit 的 Worked 时间线。',
      thinkingDurationMs: 2400
    },
    timestamp: T0 + 200
  }),
  ...toolTriple(
    'tc-grep-1',
    'grep',
    { pattern: 'ChatSessionView', glob: 'packages/ui/**/*.{ts,tsx}' },
    'packages/ui/src/chat-session/ChatSessionView.tsx\npackages/ui/src/chat-session/index.ts\npackages/ui/playground/PlaygroundApp.tsx',
    T0 + 800
  ),
  ...toolTriple(
    'tc-glob-1',
    'glob',
    { pattern: 'packages/ui/src/chat-session/*' },
    'ChatSessionView.tsx\nChatMessageList.tsx\nChatComposer.tsx\nMessageTurnItem.tsx\nchat-session.scss',
    T0 + 1200
  ),
  ...toolTriple(
    'tc-read-1',
    'read_file',
    { path: 'packages/ui/src/chat-session/types.ts' },
    'export type ChatSessionViewProps = {\n  isLoading: boolean\n  isEmpty: boolean\n  messages: ChatSessionMessage[]\n  liveEvents: BaseEvent[]\n  isRun: boolean\n}',
    T0 + 1600
  ),
  ...toolTriple(
    'tc-list-1',
    'list_dir',
    { path: 'packages/ui/src/chat-session' },
    'agui-timeline.ts\nChatComposer.tsx\nChatMessageList.tsx\nChatPlanCard.tsx\nChatSessionView.tsx\nchat-session.scss\nComposerSkillMenu.tsx\nfile-edit-diff.ts\nindex.ts\nMessageTurnItem.tsx\nsession-utils.ts\ntypes.ts\nworked-timeline.ts',
    T0 + 2000
  ),
  ...toolTriple(
    'tc-shell-1',
    'shell',
    { command: 'pnpm --filter @openworker/ui typecheck' },
    '> tsc --noEmit\n\nDone in 8.2s',
    T0 + 2500
  ),
  ...toolTriple(
    'tc-write-1',
    'write_file',
    { path: 'packages/ui/playground/mock-session.ts', content: FILE_AFTER },
    JSON.stringify({
      path: 'packages/ui/playground/mock-session.ts',
      before: 'export const MOCK_HISTORY_MESSAGES = []\n',
      after: FILE_AFTER,
      created: false
    }),
    T0 + 3000
  )
]

const secondAssistantEvents: BaseEvent[] = [
  ev({
    type: EventType.CUSTOM,
    name: 'cursor.thinking',
    value: {
      text: '第二回合补充代码块、表格和更长的说明，方便在 400×500 里验证 sticky 用户气泡与滚动条。',
      thinkingDurationMs: 1600
    },
    timestamp: T0 + 8000
  }),
  ...toolTriple(
    'tc-read-2',
    'read_file',
    { path: 'packages/ui/src/chat-session/chat-session.scss' },
    '.app-content {\n  width: 100%;\n  height: 100%;\n  overflow: hidden;\n}',
    T0 + 8400
  ),
  ...toolTriple(
    'tc-web-1',
    'web_search',
    { query: 'simplebar-react flex height 100%' },
    '常见做法：父级 height:100% + flex:1 1 0，避免内容把滚动容器撑开。',
    T0 + 8800
  )
]

/** 多回合长会话（用于验证列表滚动、Worked、Markdown） */
export const MOCK_HISTORY_MESSAGES: ChatSessionMessage[] = [
  {
    id: 'u1',
    role: 'user',
    content:
      '帮我看一下 ChatSession 视图抽出来之后长什么样。请用比较长的模拟数据：多几轮对话、带工具过程、Markdown 代码块，好在 400×500 的框里测滚动。'
  },
  {
    id: 'a1',
    role: 'assistant',
    content: [
      '已经铺了一条带 **Thought / Explored / Shell / Edit** 的回合。窄容器里可以：',
      '',
      '1. 展开上方「已工作」看过程条',
      '2. 点用户气泡进入就地编辑',
      '3. 输入 `/` 打开技能菜单',
      '4. 继续往下滚，后面还有更长的说明和代码',
      '',
      '外链确认：[OpenWorker 文档](https://example.com/docs)',
      '',
      '```ts',
      'type ChatSessionViewProps = {',
      '  messages: ChatSessionMessage[]',
      '  liveEvents: BaseEvent[]',
      '  isRun: boolean',
      '}',
      '```',
      '',
      '宿主把 `TEXT_MESSAGE_CONTENT` 折进 `content`，把 `TOOL_CALL_*` 放进 `aguiEvents` / `liveEvents`，视图只负责画。'
    ].join('\n'),
    aguiEvents: historyAssistantEvents
  },
  {
    id: 'u2',
    role: 'user',
    content:
      '高度自适应看起来可以了。再补一段很长的回复，我要确认：用户气泡 sticky、输入框贴底、中间列表能独立滚动，而不是把整个 400×500 撑破。'
  },
  {
    id: 'a2',
    role: 'assistant',
    content: [
      '布局约定如下。',
      '',
      '| 区域 | 行为 |',
      '| --- | --- |',
      '| `.app-content` | `width/height: 100%`，超出裁切 |',
      '| 消息列表 | `flex: 1 1 0`，内部 SimpleBar 滚动 |',
      '| 输入框 | `flex-shrink: 0`，贴在容器底部 |',
      '',
      '若列表高度跟着正文一起长，多半是滚动容器没有拿到确定高度。正确姿势是父级写死高度（比如预览舞台 400×500），子级用 flex 吃剩余空间：',
      '',
      '```scss',
      '.app-messages-scroll[data-simplebar] {',
      '  flex: 1 1 0;',
      '  min-height: 0;',
      '  height: 0;',
      '}',
      '```',
      '',
      '下面再堆一段占位说明，方便你连续滚动：',
      '',
      '- 历史消息应保留 `aguiEvents`，直播回合走 `liveEvents`',
      '- `isRun` 为 true 时最新 assistant 进入流式态，空正文显示「…」',
      '- 计划卡不是 AG-UI 字段，由宿主从 `CUSTOM(openworker.plan)` 解析后传入',
      '- 斜杠菜单的 token 解析留在宿主，视图只渲染 listbox',
      '- 复制回复、外链确认依赖 antd `App` 包裹',
      '',
      '滚动到这里之后，下一条用户消息会 sticky 在列表顶部，你可以再往下看第三回合。'
    ].join('\n'),
    aguiEvents: secondAssistantEvents
  },
  {
    id: 'u3',
    role: 'user',
    content:
      '第三回合也写长一点。我想同时看到：较长用户提示词、助手里的有序列表、引用块，以及再一次工具时间线。'
  },
  {
    id: 'a3',
    role: 'assistant',
    content: [
      '可以。把预览场景当成宿主契约说明书来用：',
      '',
      '> 视图不拉 SSE。宿主持续改 `messages` / `liveEvents` / `isRun`，打字机和过程条就会动。',
      '',
      '建议按这个顺序点顶部切换：',
      '',
      '1. **空会话**：居中输入框 + 工作区插槽',
      '2. **加载中**：只有转圈，确认不会闪空列表',
      '3. **历史会话**：本条长数据，重点看滚动',
      '4. **流式输出**：前面几轮历史 + 正在增长的 assistant',
      '5. **计划卡片**：列表上方出现可编辑计划',
      '',
      '```bash',
      'pnpm --filter @openworker/ui playground',
      '# 默认尝试 5179，占用则顺延（当前常见是 :5180）',
      '```',
      '',
      '如果列表仍无法滚动，检查舞台是否真的是 400×500，以及 `.app-content` 是否 `overflow: hidden`。'
    ].join('\n'),
    aguiEvents: [
      ev({
        type: EventType.CUSTOM,
        name: 'cursor.thinking',
        value: { text: '补第三回合长文案，确保 sticky 与滚动同时可测。', thinkingDurationMs: 900 },
        timestamp: T0 + 12_000
      }),
      ...toolTriple(
        'tc-grep-3',
        'grep',
        { pattern: 'ow-ui-playground-stage' },
        'packages/ui/playground/playground.scss',
        T0 + 12_400
      )
    ]
  },
  {
    id: 'u4',
    role: 'user',
    content: '最后再来一句短的，垫在最底下，方便我滚到底看输入框会不会挡住正文。'
  },
  {
    id: 'a4',
    role: 'assistant',
    content:
      '这是最后一轮短回复。若你还能看见这条，并且下方输入框完整露出来、上面的长文需要上翻才能看完，高度自适应就算过关。'
  }
]

const streamingLiveEvents: BaseEvent[] = [
  ev({
    type: EventType.CUSTOM,
    name: 'cursor.thinking',
    value: {
      text: '先保留历史长会话，再在最新 assistant 上叠加 liveEvents，验证流式时列表仍可滚。',
      thinkingDurationMs: 1400
    },
    timestamp: T0 + 20_000
  }),
  ...toolTriple(
    'tc-list-live',
    'list_dir',
    { path: 'packages/ui/src/chat-session' },
    'ChatSessionView.tsx\nChatMessageList.tsx\nchat-session.scss',
    T0 + 20_400
  ),
  ...toolTriple(
    'tc-read-live',
    'read_file',
    { path: 'packages/ui/src/chat-session/ChatSessionView.tsx' },
    'export function ChatSessionView(props: ChatSessionViewProps) { ... }',
    T0 + 20_800
  )
]

/** 流式场景：前面带几轮历史，最新 assistant 仍在输出 */
export const MOCK_STREAMING_MESSAGES: ChatSessionMessage[] = [
  ...MOCK_HISTORY_MESSAGES.slice(0, 4),
  {
    id: 'su-live',
    role: 'user',
    content:
      '在已有长历史上继续问：请一边跑工具一边流式写出总结，我要看 Worked 展开时列表会不会把输入框顶出容器。'
  },
  {
    id: 'sa-live',
    role: 'assistant',
    content: '正在读取 `chat-session` 目录',
    streaming: true
  }
]

/** 流式场景的直播 AG-UI 事件 */
export const MOCK_STREAMING_LIVE_EVENTS: BaseEvent[] = streamingLiveEvents

/** 流式正文后续会逐字追加的稿件 */
export const MOCK_STREAM_TAIL = [
  '。接下来会列出目录里的视图文件，并把结论写成几段，方便观察打字机和自动贴底。',
  '',
  'ChatSessionView 负责空态 / 加载 / 列表 / 计划卡 / 输入框；ChatMessageList 把 liveEvents 派生成 Worked 树。',
  '',
  '若 `isRun` 为 true，最新 assistant 会展开过程条，复制按钮隐藏，空正文显示省略号。',
  '',
  '宿主只需按 delta 追加 `content`，不要每条 token 新建一条消息。写到这里之后还可以再往下滚，确认输入区仍然贴在 400×500 的底部。'
].join('\n')

/** 计划卡初始 Markdown */
export const MOCK_PLAN_MARKDOWN = [
  '# 预览 ChatSession',
  '',
  '## 目标',
  '在固定 400×500 容器里确认列表滚动、输入贴底、计划卡不把布局撑破。',
  '',
  '## 步骤',
  '1. 空会话：居中输入框',
  '2. 历史：多回合 + Worked + 长 Markdown',
  '3. 流式：`isRun` + 递增 content + liveEvents',
  '4. 计划：本卡片可编辑后点「开始构建」',
  '',
  '## 风险',
  '- SimpleBar 未拿到确定高度时会跟着正文变高',
  '- 空态若使用 `20vh` 内边距，在矮容器里会把输入框挤出画面',
  '',
  '## 验收',
  '滚到列表底部仍能完整看到发送按钮；用户长气泡 sticky 不遮住输入区。'
].join('\n')

export type PlaygroundScene = 'empty' | 'loading' | 'history' | 'streaming' | 'plan'

export const PLAYGROUND_SCENES: { id: PlaygroundScene; label: string }[] = [
  { id: 'empty', label: '空会话' },
  { id: 'loading', label: '加载中' },
  { id: 'history', label: '历史会话' },
  { id: 'streaming', label: '流式输出' },
  { id: 'plan', label: '计划卡片' }
]
