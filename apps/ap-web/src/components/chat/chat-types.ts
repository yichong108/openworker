/** 对话角色 */
export type ChatRole = 'user' | 'assistant' | 'system'

/** 一条聊天气泡 */
export type ChatMessage = {
  id: string
  role: ChatRole
  content: string
  streaming?: boolean
}

/** 任务 Agent 会话快照（按任务文件名） */
export type ChatTranscript = {
  running: boolean
  started: boolean
  error?: string
  messages: ChatMessage[]
}

/** 底部输入区（后续完整对话使用） */
export type ChatComposerState = {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  disabled?: boolean
  placeholder?: string
}
