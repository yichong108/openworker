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

/**
 * 配置弹窗：左侧一级菜单，右侧对应内容。当前仅有 AI 配置。
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

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        aria-label="关闭配置"
        onClick={onClose}
      />
      <div className="relative flex h-[min(34rem,82vh)] w-full max-w-3xl overflow-hidden rounded-2xl bg-[var(--paper)] text-[var(--ink)] shadow-lift">
        <nav className="w-40 shrink-0 border-r border-black/10 bg-black/[0.03] py-4">
          <p className="px-4 pb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--ink-soft)]">
            设置
          </p>
          {MENUS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setMenu(item.id)}
              className={`block w-full px-4 py-2 text-left text-sm ${
                menu === item.id ? 'bg-[var(--ink)] text-[var(--paper)]' : 'hover:bg-black/5'
              }`}
            >
              {item.label}
              {authError && item.id === 'ai' ? (
                <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-[var(--rust)]" />
              ) : null}
            </button>
          ))}
        </nav>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-black/10 px-5 py-3">
            <p className="font-display text-xl">AI配置</p>
            <button
              type="button"
              className="text-sm text-[var(--ink-soft)] hover:text-[var(--ink)]"
              onClick={onClose}
            >
              关闭
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {authError || modelError ? (
              <p className="mb-4 rounded-lg border border-[var(--rust)]/30 bg-[var(--rust)]/10 px-3 py-2 text-sm text-[var(--rust)]">
                {authError || modelError}
              </p>
            ) : null}

            <div className="mb-4 flex gap-2">
              {(['deepseek', 'cursor'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setProvider(item)
                    setModelError(null)
                    void loadModels(item)
                  }}
                  className={`rounded-lg px-3 py-1.5 text-sm ${
                    provider === item ? 'bg-[var(--ink)] text-[var(--paper)]' : 'bg-black/5'
                  }`}
                >
                  {item === 'deepseek' ? 'DeepSeek' : 'Cursor'}
                </button>
              ))}
            </div>

            {provider === 'deepseek' ? (
              <div className="space-y-4">
                <label className="block text-sm font-medium">
                  API Key
                  <input
                    type="password"
                    value={deepseekKey}
                    onChange={(event) => setDeepseekKey(event.target.value)}
                    placeholder={deepseekHint ? `已保存 ${deepseekHint}` : 'sk-...'}
                    className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 outline-none ring-[var(--brass)] focus:ring-2"
                  />
                </label>
                <ModelSelect
                  value={deepseekModel}
                  options={deepseekModels}
                  onChange={setDeepseekModel}
                  onRefresh={() => void loadModels('deepseek', deepseekKey || undefined)}
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg bg-black/[0.04] px-3 py-2 text-sm">
                  <p>
                    登录状态：
                    {loginStatus === 'logged-in' ? (
                      <span className="text-[var(--teal)]">
                        已登录{loginEmail ? `（${loginEmail}）` : ''}
                      </span>
                    ) : (
                      <span className="text-[var(--ink-soft)]">未登录</span>
                    )}
                  </p>
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
                    className="mt-2 rounded-md bg-[var(--ink)] px-3 py-1 text-xs text-[var(--paper)] disabled:opacity-50"
                  >
                    {loginBusy ? '正在打开浏览器…' : '登录 Cursor'}
                  </button>
                </div>
                <label className="block text-sm font-medium">
                  API Key（可选，与登录二选一）
                  <input
                    type="password"
                    value={cursorKey}
                    onChange={(event) => setCursorKey(event.target.value)}
                    placeholder={cursorHint ? `已保存 ${cursorHint}` : 'cursor_...'}
                    className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 outline-none ring-[var(--brass)] focus:ring-2"
                  />
                </label>
                <ModelSelect
                  value={cursorModel}
                  options={cursorModels}
                  onChange={setCursorModel}
                  onRefresh={() => void loadModels('cursor', cursorKey || undefined)}
                />
              </div>
            )}

            {saveError ? <p className="mt-3 text-sm text-[var(--rust)]">{saveError}</p> : null}
          </div>

          <footer className="flex justify-end gap-2 border-t border-black/10 px-5 py-3">
            <button
              type="button"
              className="rounded-lg px-4 py-2 text-sm text-[var(--ink-soft)]"
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

function ModelSelect({
  value,
  options,
  onChange,
  onRefresh
}: {
  value: string
  options: string[]
  onChange: (value: string) => void
  onRefresh: () => void
}) {
  return (
    <label className="block text-sm font-medium">
      模型
      <span className="mt-1 flex gap-2">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 outline-none ring-[var(--brass)] focus:ring-2"
        >
          {options.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onRefresh}
          className="shrink-0 rounded-lg border border-black/10 px-3 text-xs text-[var(--ink-soft)] hover:bg-black/5"
        >
          刷新
        </button>
      </span>
    </label>
  )
}
