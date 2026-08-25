'use client'

import { useCallback, useEffect, useState } from 'react'

type AiProvider = 'cursor' | 'deepseek'

type PublicConfig = {
  provider: AiProvider
  cursor: { hasKey: boolean; keyHint: string; model: string }
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
 * 配置弹窗：夜间工作室外壳 + 奶油纸面表单。
 */
export function ConfigDialog({ open, authError, onClose }: ConfigDialogProps) {
  const [menu, setMenu] = useState<'ai'>('ai')
  const [provider, setProvider] = useState<AiProvider>('cursor')
  const [cursorKey, setCursorKey] = useState('')
  const [deepseekKey, setDeepseekKey] = useState('')
  const [cursorModel, setCursorModel] = useState('composer-2.5')
  const [deepseekModel, setDeepseekModel] = useState('deepseek-chat')
  const [cursorModels, setCursorModels] = useState<string[]>(['composer-2.5'])
  const [deepseekModels, setDeepseekModels] = useState<string[]>(['deepseek-chat'])
  const [cursorHint, setCursorHint] = useState('')
  const [deepseekHint, setDeepseekHint] = useState('')
  const [loginStatus, setLoginStatus] = useState('logged-out')
  const [loginEmail, setLoginEmail] = useState<string | null>(null)
  const [modelError, setModelError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loginBusy, setLoginBusy] = useState(false)

  const loadStatus = useCallback(async () => {
    const response = await fetch('/api/config/ai/cursor/status', { cache: 'no-store' })
    const payload = (await response.json()) as { status?: string; email?: string | null }
    if (response.ok) {
      setLoginStatus(payload.status ?? 'logged-out')
      setLoginEmail(payload.email ?? null)
    }
  }, [])

  const loadModels = useCallback(async (target: AiProvider, apiKey?: string) => {
    setModelError(null)
    const response = await fetch('/api/config/ai/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: target, ...(apiKey ? { apiKey } : {}) })
    })
    const payload = (await response.json()) as {
      models?: string[]
      authError?: string
      error?: string
    }
    const models = payload.models?.length
      ? payload.models
      : target === 'cursor'
        ? ['composer-2.5']
        : ['deepseek-chat']
    if (target === 'cursor') {
      setCursorModels(models)
      setCursorModel((current) => (models.includes(current) ? current : models[0]))
    } else {
      setDeepseekModels(models)
      setDeepseekModel((current) => (models.includes(current) ? current : models[0]))
    }
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
    setProvider(payload.provider)
    setCursorModel(payload.cursor.model)
    setDeepseekModel(payload.deepseek.model)
    setCursorHint(payload.cursor.keyHint)
    setDeepseekHint(payload.deepseek.keyHint)
    setCursorKey('')
    setDeepseekKey('')
    await Promise.all([loadStatus(), loadModels(payload.provider)])
  }, [loadModels, loadStatus])

  useEffect(() => {
    if (!open) return
    setMenu('ai')
    setSaveError(null)
    void loadConfig()
  }, [open, loadConfig])

  if (!open) return null

  const loggedIn = loginStatus === 'logged-in'
  const models = provider === 'cursor' ? cursorModels : deepseekModels
  const model = provider === 'cursor' ? cursorModel : deepseekModel
  const setModel = provider === 'cursor' ? setCursorModel : setDeepseekModel
  const apiKey = provider === 'cursor' ? cursorKey : deepseekKey
  const setApiKey = provider === 'cursor' ? setCursorKey : setDeepseekKey
  const keyHint = provider === 'cursor' ? cursorHint : deepseekHint
  const banner = authError || modelError || saveError

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="关闭配置"
        onClick={onClose}
      />
      <div className="relative flex h-[min(38rem,86vh)] w-full max-w-3xl overflow-hidden rounded-2xl border border-[var(--panel-edge)] bg-[var(--panel)] text-[var(--paper)] shadow-lift">
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
              <p className="mt-1 text-sm text-[var(--ink-soft)]">选择服务商、模型和鉴权方式。</p>
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
            <div className="mt-2 flex gap-2">
              {(['deepseek', 'cursor'] as const).map((item) => {
                const active = provider === item
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setProvider(item)
                      setModelError(null)
                      void loadModels(item)
                    }}
                    className={`rounded-lg px-3.5 py-1.5 text-sm transition ${
                      active
                        ? 'bg-[var(--ink)] text-[var(--paper)]'
                        : 'bg-black/[0.05] text-[var(--ink-soft)] hover:bg-black/10 hover:text-[var(--ink)]'
                    }`}
                  >
                    {item === 'deepseek' ? 'DeepSeek' : 'Cursor'}
                  </button>
                )
              })}
            </div>

            <label className="mt-5 block text-sm font-medium">
              模型
              <span className="mt-1.5 flex gap-2">
                <select
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  className={FIELD}
                >
                  {models.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  title="刷新模型列表"
                  onClick={() => void loadModels(provider, apiKey || undefined)}
                  className="shrink-0 rounded-lg border border-black/10 px-3 text-xs text-[var(--ink-soft)] hover:bg-black/5 hover:text-[var(--ink)]"
                >
                  刷新
                </button>
              </span>
            </label>

            <label className="mt-5 block text-sm font-medium">
              API Key
              {provider === 'cursor' ? (
                <span className="ml-2 text-xs font-normal text-[var(--ink-soft)]">
                  可选，与登录二选一
                </span>
              ) : null}
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={
                  keyHint ? `已保存 ${keyHint}` : provider === 'cursor' ? 'cursor_...' : 'sk-...'
                }
                className={FIELD}
              />
            </label>

            {provider === 'cursor' ? (
              <div className="mt-5 flex items-center justify-between gap-4 rounded-xl bg-[var(--paper-deep)] px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Cursor 登录</p>
                  <p className="mt-0.5 truncate text-xs text-[var(--ink-soft)]">
                    {loggedIn
                      ? `已登录${loginEmail ? ` · ${loginEmail}` : ''}`
                      : '用浏览器登录后即可拉取模型'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={loginBusy}
                  onClick={() => {
                    setLoginBusy(true)
                    setSaveError(null)
                    void fetch('/api/config/ai/cursor/login', { method: 'POST' })
                      .then(async (response) => {
                        const payload = (await response.json()) as {
                          error?: string
                          email?: string
                        }
                        if (!response.ok) {
                          setSaveError(payload.error || '登录失败')
                          return
                        }
                        await loadStatus()
                        await loadModels('cursor')
                      })
                      .finally(() => setLoginBusy(false))
                  }}
                  className="shrink-0 rounded-lg bg-[var(--ink)] px-3 py-1.5 text-xs text-[var(--paper)] disabled:opacity-50"
                >
                  {loginBusy ? '正在打开…' : loggedIn ? '重新登录' : '登录'}
                </button>
              </div>
            ) : null}
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
                    provider,
                    cursor: {
                      model: cursorModel,
                      ...(cursorKey.trim() ? { apiKey: cursorKey } : {})
                    },
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
