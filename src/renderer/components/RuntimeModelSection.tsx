import { useState } from 'react'
import { Check } from 'lucide-react'
import { THINKING_LEVEL_ORDER } from '@shared/types'
import { useAppStore } from '../store'
import { useT } from '../i18n'

/**
 * Settings → Models (current profile): the new-session default model and
 * default thinking level, read from and written to the runtime's own config
 * (omp config enabledModels / defaultThinkingLevel), read-after-write
 * verified. The composer pickers handle the per-session selection.
 */
export default function RuntimeModelSection() {
  const overview = useAppStore((s) => s.runtimeOverview)
  const runtimeModels = useAppStore((s) => s.runtimeModels)
  const selectRuntimeDefaultModel = useAppStore((s) => s.selectRuntimeDefaultModel)
  const setRuntimeDefaultThinking = useAppStore((s) => s.setRuntimeDefaultThinking)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const t = useT()

  const defaultModel = overview?.modelState.defaultModel ?? ''
  const defaultThinking = overview?.modelState.defaultThinkingLevel ?? ''
  const catalog = runtimeModels

  const flash = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const changeModel = async (selector: string) => {
    setError(null)
    const r = await selectRuntimeDefaultModel(selector)
    if (r.ok) flash()
    else setError(r.error ?? 'failed')
  }

  const changeThinking = async (level: string) => {
    setError(null)
    const r = await setRuntimeDefaultThinking(level)
    if (r.ok) flash()
    else setError(r.error ?? 'failed')
  }

  const selectCls =
    'h-8 min-w-44 rounded-lg border border-line bg-ink-850 px-2.5 text-[12.5px] text-cream outline-none focus:border-ink-600'

  const groups = catalog.reduce<Map<string, typeof catalog>>((acc, m) => {
    const list = acc.get(m.provider) ?? []
    list.push(m)
    acc.set(m.provider, list)
    return acc
  }, new Map())

  return (
    <section className="overflow-hidden rounded-[16px] border border-line bg-ink-850 shadow-card">
      <div className="border-b border-line px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-cream-faint">
        {t('settings.models')}
      </div>
      <div className="divide-y divide-line/60 px-4">
        <div className="flex items-center justify-between gap-3 py-3">
          <span className="text-[13px] text-cream">{t('settings.defaultModel')}</span>
          <span className="flex items-center gap-2">
            {catalog.length > 0 ? (
              <select value={defaultModel} onChange={(e) => changeModel(e.target.value)} className={selectCls}>
                <option value="">{t('settings.modelAuto')}</option>
                {Array.from(groups.entries()).map(([pid, list]) => (
                  <optgroup key={pid} label={pid}>
                    {list.map((m) => (
                      <option key={m.selector} value={m.selector}>
                        {m.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            ) : (
              <span className="text-xs text-cream-faint">{t('settings.modelCatalogEmpty')}</span>
            )}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 py-3">
          <span className="text-[13px] text-cream">{t('settings.thinkingCurrent')}</span>
          <span className="flex items-center gap-2">
            <select
              value={defaultThinking}
              onChange={(e) => changeThinking(e.target.value)}
              className={selectCls}
            >
              <option value="">{t('settings.thinkingDefault')}</option>
              {THINKING_LEVEL_ORDER.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
            {saved && (
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <Check size={11} />
              </span>
            )}
          </span>
        </div>
      </div>
      {error && (
        <p className="px-4 pb-2 text-xs text-red-500">{t('settings.saveFailed', { error })}</p>
      )}
      <p className="px-4 pb-3 text-[11px] leading-relaxed text-cream-faint">
        {t('settings.modelNoteCurrent')}
      </p>
    </section>
  )
}
