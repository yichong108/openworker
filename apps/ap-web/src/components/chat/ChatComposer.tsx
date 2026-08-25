'use client'

type ChatComposerProps = {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  disabled?: boolean
  placeholder?: string
}

/**
 * 对话输入区：textarea + 发送。完整对话功能启用时由 AiChatDialog 渲染。
 */
export function ChatComposer({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder = '输入消息'
}: ChatComposerProps) {
  return (
    <form
      className="flex items-end gap-2 border-t border-black/10 p-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (disabled) return
        onSubmit()
      }}
    >
      <textarea
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        rows={2}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            if (!disabled) onSubmit()
          }
        }}
        className="min-h-[2.5rem] flex-1 resize-none rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none ring-[var(--brass)] focus:ring-2 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="rounded-lg bg-[var(--ink)] px-3 py-2 text-sm text-[var(--paper)] disabled:opacity-40"
      >
        发送
      </button>
    </form>
  )
}
