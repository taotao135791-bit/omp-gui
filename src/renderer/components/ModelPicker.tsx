import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronUp, Cpu, KeyRound } from 'lucide-react'
import { PI_PROVIDERS } from '@shared/types'
import { useAppStore } from '../store'
import { useT } from '../i18n'

/**
 * Codex-style model picker in the composer. Lists every model pi can
 * actually use (providers with saved keys), grouped by provider; picking
 * one persists it as the default and hot-switches the live session.
 */
export default function ModelPicker() {
  const { models, modelConfig, loadModelState, selectModel } = useAppStore()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const t = useT()

  useEffect(() => {
    if (!modelConfig) loadModelState()
  }, [modelConfig, loadModelState])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const provider = modelConfig?.defaultProvider ?? ''
  const modelId = modelConfig?.defaultModel ?? ''
  const current = models.find((m) => m.provider === provider && m.id === modelId)
  const label = current?.name ?? (modelId || t('composer.modelAuto'))
  const providerLabel = (id: string) => PI_PROVIDERS.find((p) => p.id === id)?.label ?? id

  const groups = models.reduce<Map<string, typeof models>>((acc, m) => {
    const list = acc.get(m.provider) ?? []
    list.push(m)
    acc.set(m.provider, list)
    return acc
  }, new Map())

  const pick = async (p: string, id: string) => {
    setOpen(false)
    await selectModel(p, id)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => {
          setOpen((v) => !v)
          if (!open) loadModelState()
        }}
        className="focus-ring flex items-center gap-1.5 rounded-lg border border-transparent px-2 py-1.5 text-[11px] font-medium text-cream-dim transition-colors hover:border-line hover:bg-overlay hover:text-cream"
        title={t('composer.model')}
      >
        <Cpu size={13} />
        <span className="max-w-36 truncate">{label}</span>
        <ChevronUp size={11} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-1.5 max-h-80 w-64 overflow-y-auto rounded-xl border border-line bg-ink-900 p-1 shadow-pop">
          <button
            onClick={() => pick('', '')}
            className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] text-cream transition hover:bg-ink-800"
          >
            <span>{t('composer.modelAuto')}</span>
            {!provider && <Check size={12} className="text-accent" />}
          </button>

          {Array.from(groups.entries()).map(([pid, list]) => (
            <div key={pid} className="mt-1">
              <div className="px-2.5 pb-0.5 pt-1.5 text-[10px] font-medium uppercase tracking-wider text-cream-faint">
                {providerLabel(pid)}
              </div>
              {list.map((m) => (
                <button
                  key={`${m.provider}/${m.id}`}
                  onClick={() => pick(m.provider, m.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] text-cream transition hover:bg-ink-800"
                >
                  <span className="min-w-0">
                    <span className="block truncate">{m.name}</span>
                    <span className="block truncate font-mono text-[10px] text-cream-faint">
                      {m.id}
                    </span>
                  </span>
                  {provider === m.provider && modelId === m.id && (
                    <Check size={12} className="shrink-0 text-accent" />
                  )}
                </button>
              ))}
            </div>
          ))}

          {models.length === 0 && (
            <button
              onClick={() => {
                setOpen(false)
                navigate('/settings')
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] text-cream-dim transition hover:bg-ink-800 hover:text-cream"
            >
              <KeyRound size={12} />
              {t('composer.noModels')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
