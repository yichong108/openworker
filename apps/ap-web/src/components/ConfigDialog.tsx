'use client'

import { useCallback, useEffect, useState } from 'react'

type PublicConfig = {
  deepseek: { hasKey: boolean; keyHint: string; model: string }
}

type ConfigDialogProps = {
  open: boolean
  authError: string | null
  onClose: () => void
}

const MENUS = [{ id: 'ai', label: 'AI配置' }] as const

const FIELD =
  'mt-1.5 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none ring-[var(--brass)] focus:ring-2'

/**
 * 配置抽屉：自右向左滑入，左菜单 + 右内容区。
 */
export function ConfigDialog({ open, authError, onClose }: ConfigDialogProps) {
  const [menu, setMenu] = useState<'ai'>('ai')
  const [deepseekKey, setDeepseekKey] = useState('')
  const [deepseekModel, setDeepseekModel] = useState('deepseek-chat')
  const [deepseekModels, setDeepseekModels] = useState<string[]>(['deepseek-chat'])
  const [deepseekHint, setDeepseekHint] = useState('')
  const [modelError, setModelError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const loadModels = useCallback(async (apiKey?: string) => {
    setModelError(null)
    const response = await fetch('/api/config/ai/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(apiKey ? { apiKey } : {}) })
    })
    const payload = (await response.json()) as {
      models?: string[]
      authError?: string
      error?: string
    }
    const models = payload.models?.length ? payload.models : ['deepseek-chat']
    setDeepseekModels(models)
    setDeepseekModel((current) => (models.includes(current) ? current : models[0]))
    if (payload.authError || !response.ok) {
      setModelError(payload.authError || payload.error || '无法获取模型列表')
    }
  }, [])

  const loadConfig = useCallback(async () => {
    const response = await fetch('/api/config/ai', { cache: 'no-store' })
    const payload = (await response.json()) as PublicConfig & { error?: string }
    if (!response.ok) {
      setSaveError(payload.error || '无法读取配置')
      return
    }
    setDeepseekModel(payload.deepseek.model)
    setDeepseekHint(payload.deepseek.keyHint)
    setDeepseekKey('')
    await loadModels()
  }, [loadModels])

  useEffect(() => {
    if (!open) return
    setMenu('ai')
    setSaveError(null)
    void loadConfig()
  }, [open, loadConfig])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const banner = authError || modelError || saveError

  return (
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 anim-fade-in"
        aria-label="关闭配置"
        onClick={onClose}
      />
      <div className="absolute right-0 top-0 flex h-full w-[min(42rem,92vw)] overflow-hidden border-l border-[var(--panel-edge)] bg-[var(--panel)] text-[var(--paper)] shadow-lift anim-slide-in-right">
        <nav className="flex w-40 shrink-0 flex-col border-r border-[var(--panel-edge)] px-3 py-5">
          <p className="px-2 font-display text-[11px] tracking-[0.22em] text-[var(--brass)]">
            CONFIG
          </p>
          <div className="mt-5 flex flex-col gap-1">
            {MENUS.map((item) => {
              const active = menu === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMenu(item.id)}
                  className={`relative rounded-lg px-3 py-2.5 text-left transition ${
                    active
                      ? 'bg-white/[0.06] text-[var(--paper)]'
                      : 'text-[var(--mist)] hover:bg-white/[0.04] hover:text-[var(--paper)]'
                  }`}
                >
                  {active ? (
                    <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-[var(--brass)]" />
                  ) : null}
                  <span className="flex items-center gap-2 text-sm">
                    {item.label}
                    {authError && item.id === 'ai' ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--rust)]" />
                    ) : null}
                  </span>
                </button>
              )
            })}
          </div>
        </nav>

        <section className="flex min-w-0 flex-1 flex-col bg-[var(--paper)] text-[var(--ink)]">
          <header className="flex items-start justify-between px-6 pt-5">
            <div>
              <p className="font-display text-2xl">AI 配置</p>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">DeepSeek API Key 与模型。</p>
            </div>
            <button
              type="button"
              aria-label="关闭"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-black/5 hover:text-[var(--ink)]"
              onClick={onClose}
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--ink-soft)]">
              服务商
            </p>
            <p className="mt-2 inline-block rounded-lg bg-[var(--ink)] px-3.5 py-1.5 text-sm text-[var(--paper)]">
              DeepSeek
            </p>

            <label className="mt-5 block text-sm font-medium">
              模型
              <span className="mt-1.5 flex gap-2">
                <select
                  value={deepseekModel}
                  onChange={(event) => setDeepseekModel(event.target.value)}
                  className={FIELD}
                >
                  {deepseekModels.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  title="刷新模型列表"
                  onClick={() => void loadModels(deepseekKey || undefined)}
                  className="shrink-0 rounded-lg border border-black/10 px-3 text-xs text-[var(--ink-soft)] hover:bg-black/5 hover:text-[var(--ink)]"
                >
                  刷新
                </button>
              </span>
            </label>

            <label className="mt-5 block text-sm font-medium">
              API Key
              <input
                type="password"
                value={deepseekKey}
                onChange={(event) => setDeepseekKey(event.target.value)}
                placeholder={deepseekHint ? `已保存 ${deepseekHint}` : 'sk-...'}
                className={FIELD}
              />
            </label>
          </div>

          <footer className="flex items-center justify-end gap-2 px-6 pb-5">
            {banner ? (
              <p
                className="mr-auto max-w-[22rem] truncate text-sm text-[var(--rust)]"
                title={banner}
              >
                {banner}
              </p>
            ) : null}
            <button
              type="button"
              className="rounded-lg px-4 py-2 text-sm text-[var(--ink-soft)] hover:bg-black/5"
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true)
                setSaveError(null)
                void fetch('/api/config/ai', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    deepseek: {
                      model: deepseekModel,
                      ...(deepseekKey.trim() ? { apiKey: deepseekKey } : {})
                    }
                  })
                })
                  .then(async (response) => {
                    const payload = (await response.json()) as { error?: string }
                    if (!response.ok) {
                      setSaveError(payload.error || '保存失败')
                      return
                    }
                    onClose()
                  })
                  .finally(() => setBusy(false))
              }}
              className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-[var(--paper)] disabled:opacity-60"
            >
              {busy ? '保存中…' : '保存'}
            </button>
          </footer>
        </section>
      </div>
    </div>
  )
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
