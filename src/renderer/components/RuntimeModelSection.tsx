import { useEffect, useState } from 'react'
import { Check, KeyRound, RotateCcw, Save, Trash2 } from 'lucide-react'
import { useAppStore } from '../store'
import { useT } from '../i18n'
import { defaultThinkingOptionsFor } from '../lib/thinking'
import { currentValueState } from '../lib/runtimeSelect'

/**
 * Settings → Models (current profile). One coherent configuration form:
 *
 *   1. Provider dropdown  — the runtime's own provider list
 *                              (get_login_providers)
 *   2. Model dropdown      — omp models --json filtered by provider
 *                              (persisted via modelRoles.default)
 *   3. API key input       — direct paste, provider-validated by the runtime
 *                              (native login flow's paste-key prompt)
 *   4. Default thinking    — config defaultThinkingLevel (auto..max)
 *   5. Save / Reset / Remove key — explicit persist, delete config, delete key
 *
 * Runtime truth is always shown even when the persisted value is absent from
 * the catalog (synthetic "unavailable"/"unsupported" option).
 */
export default function RuntimeModelSection() {
  const overview = useAppStore((s) => s.runtimeOverview)
  const runtimeModels = useAppStore((s) => s.runtimeModels)
  const selectRuntimeDefaultModel = useAppStore((s) => s.selectRuntimeDefaultModel)
  const setRuntimeDefaultThinking = useAppStore((s) => s.setRuntimeDefaultThinking)
  const setRuntimeApiKey = useAppStore((s) => s.setRuntimeApiKey)
  const logoutProvider = useAppStore((s) => s.logoutProvider)
  const loadRuntimeOverview = useAppStore((s) => s.loadRuntimeOverview)
  const loadRuntimeModels = useAppStore((s) => s.loadRuntimeModels)
  const t = useT()

  const defaultModel = overview?.modelState.defaultModel ?? ''
  const defaultThinking = overview?.modelState.defaultThinkingLevel ?? ''
  const providers = overview?.providers ?? []

  const [provider, setProvider] = useState('')
  const [model, setModel] = useState(defaultModel)
  const [thinking, setThinking] = useState(defaultThinking)
  const [keyInput, setKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [keyBusy, setKeyBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setModel(defaultModel)
    setThinking(defaultThinking)
    const defaultProvider = defaultModel.split('/')[0]
    if (defaultProvider) setProvider((p) => p || defaultProvider)
  }, [defaultModel, defaultThinking])

  // Seed the provider from the persisted model's provider when set.
  useEffect(() => {
    if (!provider && defaultModel) setProvider(defaultModel.split('/')[0])
  }, [provider, defaultModel])

  const sortedProviders = [...providers].sort(
    (a, b) => Number(b.authenticated) - Number(a.authenticated) || a.name.localeCompare(b.name)
  )

  const modelOptions = runtimeModels.filter((m) => m.provider === provider)
  const modelSelectors = modelOptions.map((m) => m.selector)
  const modelState = currentValueState(model, modelSelectors)

  const defaultEntry =
    runtimeModels.find((m) => m.selector === model) ??
    runtimeModels.find((m) => m.selector === defaultModel)
  const thinkingOptions = defaultThinkingOptionsFor(defaultEntry)
  const thinkingState = currentValueState(thinking, thinkingOptions)

  const flashSaved = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const save = async () => {
    if (saving) return
    setSaving(true)
    setError(null)
    const modelRes = await selectRuntimeDefaultModel(model)
    const thinkingRes = await setRuntimeDefaultThinking(thinking)
    setSaving(false)
    if (modelRes.ok && thinkingRes.ok) {
      flashSaved()
      await loadRuntimeOverview(true)
      await loadRuntimeModels()
    } else {
      setError(modelRes.error ?? thinkingRes.error ?? 'failed')
    }
  }

  const reset = async () => {
    if (saving) return
    setSaving(true)
    setError(null)
    const modelRes = await selectRuntimeDefaultModel('')
    const thinkingRes = await setRuntimeDefaultThinking('')
    setSaving(false)
    if (modelRes.ok && thinkingRes.ok) {
      setModel('')
      setThinking('')
      setProvider('')
      flashSaved()
      await loadRuntimeOverview(true)
      await loadRuntimeModels()
    } else {
      setError(modelRes.error ?? thinkingRes.error ?? 'failed')
    }
  }

  const saveKey = async () => {
    if (!provider || !keyInput.trim() || keyBusy) return
    setKeyBusy(true)
    setError(null)
    const res = await setRuntimeApiKey(provider, keyInput.trim())
    setKeyBusy(false)
    if (res.ok) {
      setKeyInput('')
      flashSaved()
      await loadRuntimeModels()
    } else {
      setError(res.error ?? 'failed')
    }
  }

  const removeKey = async () => {
    if (!provider || keyBusy) return
    setKeyBusy(true)
    setError(null)
    const res = await logoutProvider(provider)
    setKeyBusy(false)
    if (!res.ok) setError(res.error ?? 'failed')
    else flashSaved()
  }

  const selectCls =
    'h-8 min-w-52 rounded-lg border border-line bg-ink-850 px-2.5 text-[12.5px] text-cream outline-none focus:border-ink-600'
  const inputCls =
    'h-8 min-w-52 rounded-lg border border-line bg-ink-850 px-2.5 text-[12.5px] text-cream outline-none placeholder:text-cream-faint focus:border-ink-600'
  const buttonCls =
    'flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12px] text-cream-dim transition-colors hover:border-ink-600 hover:text-cream disabled:opacity-40'

  return (
    <section className="overflow-hidden rounded-[16px] border border-line bg-ink-850 shadow-card">
      <div className="border-b border-line px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-cream-faint">
        {t('settings.models')}
      </div>

      <div className="divide-y divide-line/60 px-4">
        {/* Provider */}
        <div className="flex items-center justify-between gap-3 py-3">
          <span className="text-[13px] text-cream">{t('settings.provider')}</span>
          <select
            value={provider}
            onChange={(e) => {
              const next = e.target.value
              setProvider(next)
              if (model && model.split('/')[0] !== next) setModel('')
              setKeyInput('')
            }}
            className={selectCls}
          >
            <option value="">{t('settings.providerAuto')}</option>
            {sortedProviders.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.authenticated ? ` · ${t('settings.authConnected')}` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Model */}
        <div className="flex items-center justify-between gap-3 py-3">
          <span className="text-[13px] text-cream">{t('settings.defaultModel')}</span>
          <select value={modelState.value} onChange={(e) => setModel(e.target.value)} className={selectCls}>
            <option value="">{t('settings.modelAuto')}</option>
            {modelState.unavailable && (
              <option value={modelState.value}>
                {modelState.value} · {t('settings.modelUnavailable')}
              </option>
            )}
            {modelOptions
              .filter((m) => m.selector !== modelState.value)
              .map((m) => (
                <option key={m.selector} value={m.selector}>
                  {m.name}
                </option>
              ))}
          </select>
        </div>
        {modelState.unavailable && (
          <p className="px-4 pb-2 text-[11px] leading-relaxed text-cream-faint">
            {t('settings.modelUnavailableNote')}
          </p>
        )}

        {/* API key */}
        <div className="flex items-center justify-between gap-3 py-3">
          <span className="text-[13px] text-cream">{t('settings.apiKey')}</span>
          <span className="flex items-center gap-2">
            {provider ? (
              <>
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void saveKey()
                  }}
                  placeholder={t('settings.apiKeyPlaceholder')}
                  className={inputCls}
                />
                <button
                  onClick={saveKey}
                  disabled={keyBusy || !keyInput.trim()}
                  className={buttonCls}
                >
                  <KeyRound size={12} />
                  {t('settings.saveKey')}
                </button>
                <button
                  onClick={removeKey}
                  disabled={keyBusy}
                  title={t('settings.clearKey')}
                  className="flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-[12px] text-cream-dim transition-colors hover:border-red-500/40 hover:text-red-500 disabled:opacity-40"
                >
                  <Trash2 size={12} />
                </button>
              </>
            ) : (
              <span className="text-xs text-cream-faint">{t('settings.modelAuto')}</span>
            )}
          </span>
        </div>

        {/* Default thinking */}
        <div className="flex items-center justify-between gap-3 py-3">
          <span className="text-[13px] text-cream">{t('settings.thinkingCurrent')}</span>
          <select
            value={thinkingState.value}
            onChange={(e) => setThinking(e.target.value)}
            className={selectCls}
          >
            <option value="">{t('settings.thinkingReset')}</option>
            {thinkingState.unavailable && (
              <option value={thinkingState.value}>
                {thinkingState.value} · {t('settings.thinkingUnsupported')}
              </option>
            )}
            {thinkingOptions
              .filter((level) => level !== thinkingState.value)
              .map((level) => (
                <option key={level} value={level}>
                  {level === 'auto' ? `${t('settings.thinkingAuto')} (auto)` : level}
                </option>
              ))}
          </select>
        </div>
        {thinkingState.unavailable && (
          <p className="px-4 pb-2 text-[11px] leading-relaxed text-amber-500">
            {thinkingState.value} · {t('settings.thinkingUnsupported')}
          </p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-line/60 px-4 py-3">
        {saved && (
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <Check size={11} />
            {t('settings.saved')}
          </span>
        )}
        <button onClick={reset} disabled={saving} className={buttonCls} title={t('settings.resetModel')}>
          <RotateCcw size={12} />
          {t('settings.resetModel')}
        </button>
        <button onClick={save} disabled={saving} className={buttonCls} title={t('settings.saveModel')}>
          <Save size={12} />
          {t('settings.saveModel')}
        </button>
      </div>

      {error && (
        <p className="px-4 pb-3 text-xs text-red-500">{t('settings.saveFailed', { error })}</p>
      )}
      <p className="px-4 pb-3 text-[11px] leading-relaxed text-cream-faint">
        {t('settings.modelNoteCurrent')}
      </p>
    </section>
  )
}