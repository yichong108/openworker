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
  const [modelsLoading, setModelsLoading] = useState(false)

  const loadModels = useCallback(async (apiKey?: string) => {
    setModelsLoading(true)
    setModelError(null)
    try {
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
    } finally {
      setModelsLoading(false)
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
            <label className="block text-sm font-medium">
              服务商
              <p className="mt-1.5 text-sm text-[var(--ink)]">DeepSeek</p>
            </label>

            <label className="mt-5 block text-sm font-medium">
              <span className="font-normal">API Key</span>
              <input
                type="password"
                value={deepseekKey}
                onChange={(event) => setDeepseekKey(event.target.value)}
                placeholder={deepseekHint ? `已保存 ${deepseekHint}` : 'sk-...'}
                className={FIELD}
              />
            </label>

            <label className="mt-5 block text-sm font-medium">
              <span className="flex items-center justify-between gap-2">
                模型
                <button
                  type="button"
                  title={modelsLoading ? '正在刷新模型列表' : '刷新模型列表'}
                  aria-label={modelsLoading ? '正在刷新模型列表' : '刷新模型列表'}
                  aria-busy={modelsLoading}
                  disabled={modelsLoading}
                  onClick={() => void loadModels(deepseekKey || undefined)}
                  className="inline-flex items-center gap-1 text-xs font-normal text-[var(--ink-soft)] transition hover:text-[var(--brass)] disabled:pointer-events-none disabled:opacity-60"
                >
                  <RefreshIcon className={`h-3.5 w-3.5 ${modelsLoading ? 'animate-spin' : ''}`} />
                  刷新
                </button>
              </span>
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
            </label>
          </div>

          {banner ? (
            <div className="flex items-start gap-2 px-6 py-3">
              <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--rust)]" />
              <p className="min-w-0 flex-1 break-all text-sm text-[var(--rust)]">{banner}</p>
            </div>
          ) : null}

          <footer className="flex items-center justify-end gap-2 border-t border-black/5 px-6 pb-5 pt-4">
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

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z"
        clipRule="evenodd"
      />
    </svg>
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

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 4v5h-5" />
      <path d="M4 20v-5h5" />
      <path d="M20 9a8 8 0 00-14.5-2.5L4 9" />
      <path d="M4 15a8 8 0 0014.5 2.5L20 15" />
    </svg>
  )
}
