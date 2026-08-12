import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronUp, Cpu, KeyRound } from 'lucide-react'
import { PI_PROVIDERS, SessionState } from '@shared/types'
import { useAppStore } from '../store'
import { useT } from '../i18n'
import MenuPortal from './MenuPortal'

/** Extract {provider, id, name} from a get_state model object (tolerant). */
function sessionModelOf(state: SessionState | null): { provider: string; id: string; name: string } | null {
  const m = state?.model
  if (!m || typeof m !== 'object') return null
  const o = m as { provider?: unknown; id?: unknown; name?: unknown }
  if (typeof o.id !== 'string' || typeof o.provider !== 'string') return null
  return { provider: o.provider, id: o.id, name: typeof o.name === 'string' ? o.name : o.id }
}

interface ModelPickerProps {
  /** Live session whose model display/hot-switch applies; null = defaults only. */
  sessionId: string | null
}

/**
 * Codex-style model picker in the composer. The list is whatever the
 * runtime can actually run right now (credential-filtered by the runtime
 * itself); the current selection is the live session's model, or the
 * runtime default when no session is open. Picking one persists it as the
 * runtime default and hot-switches the live session.
 */
export default function ModelPicker({ sessionId }: ModelPickerProps) {
  const {
    models,
    modelConfig,
    loadModelState,
    selectModel,
    runtimeOverview,
    runtimeModels,
    loadRuntimeModels
  } = useAppStore()
  const [open, setOpen] = useState(false)
  const [sessionModel, setSessionModel] = useState<{ provider: string; id: string; name: string } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const navigate = useNavigate()
  const t = useT()
  const modelVersion = useAppStore((s) => (sessionId ? (s.sessionModelVersion[sessionId] ?? 0) : 0))

  const isCurrent = runtimeOverview?.profile === 'current'

  useEffect(() => {
    if (isCurrent) {
      void loadRuntimeModels()
    } else if (!modelConfig) {
      void loadModelState()
    }
  }, [isCurrent, modelConfig, loadModelState, loadRuntimeModels])

  // The live session's actual model, straight from the runtime (get_state).
  useEffect(() => {
    if (!sessionId) {
      setSessionModel(null)
      return
    }
    let cancelled = false
    window.electronAPI.getSessionState(sessionId).then((state) => {
      if (!cancelled) setSessionModel(sessionModelOf(state))
    })
    return () => {
      cancelled = true
    }
  }, [sessionId, modelVersion])

  const providerLabel = (id: string) => PI_PROVIDERS.find((p) => p.id === id)?.label ?? id

  // ----- current selection label -------------------------------------------
  let label = t('composer.modelAuto')
  let currentSelector = ''
  if (isCurrent) {
    if (sessionModel) {
      label = sessionModel.name
      currentSelector = `${sessionModel.provider}/${sessionModel.id}`
    } else {
      const def = runtimeOverview?.modelState.defaultModel ?? ''
      if (def) {
        const m = runtimeModels.find((m) => m.selector === def)
        label = m?.name ?? def
        currentSelector = def
      }
    }
  } else {
    const provider = modelConfig?.defaultProvider ?? ''
    const modelId = modelConfig?.defaultModel ?? ''
    const current = models.find((m) => m.provider === provider && m.id === modelId)
    label = current?.name ?? (modelId || t('composer.modelAuto'))
    currentSelector = provider && modelId ? `${provider}/${modelId}` : ''
  }

  // ----- grouped list -------------------------------------------------------
  type Item = { provider: string; id: string; selector: string; name: string }
  const items: Item[] = isCurrent
    ? runtimeModels.map((m) => ({ provider: m.provider, id: m.id, selector: m.selector, name: m.name }))
    : models.map((m) => ({ provider: m.provider, id: m.id, selector: `${m.provider}/${m.id}`, name: m.name }))
  const groups = items.reduce<Map<string, Item[]>>((acc, m) => {
    const list = acc.get(m.provider) ?? []
    list.push(m)
    acc.set(m.provider, list)
    return acc
  }, new Map())

  const pick = async (selector: string) => {
    setOpen(false)
    if (!selector) {
      await selectModel('', '')
      return
    }
    const [provider, ...rest] = selector.split('/')
    await selectModel(provider, rest.join('/'))
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => {
          setOpen((v) => !v)
          if (!open) {
            if (isCurrent) void loadRuntimeModels()
            else void loadModelState()
          }
        }}
        className="focus-ring flex shrink-0 items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[12px] font-medium whitespace-nowrap text-cream-dim transition-all hover:border-ink-600 hover:text-cream"
        title={t('composer.model')}
      >
        <Cpu size={12} />
        <span className="max-w-36 truncate">{label}</span>
        <ChevronUp size={11} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>

      <MenuPortal open={open} triggerRef={triggerRef} onClose={() => setOpen(false)} width={256} maxHeight={320}>
        <button
          onClick={() => pick('')}
          className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-cream transition hover:bg-overlay"
        >
          <span>{t('composer.modelAuto')}</span>
          {!currentSelector && <Check size={12} className="text-accent" />}
        </button>

        {Array.from(groups.entries()).map(([pid, list]) => (
          <div key={pid} className="mt-1">
            <div className="px-2.5 pb-0.5 pt-1.5 text-[10px] font-medium uppercase tracking-wider text-cream-faint">
              {providerLabel(pid)}
            </div>
            {list.map((m) => (
              <button
                key={m.selector}
                onClick={() => pick(m.selector)}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-cream transition hover:bg-overlay"
              >
                <span className="min-w-0">
                  <span className="block truncate">{m.name}</span>
                  <span className="block truncate font-mono text-[10px] text-cream-faint">
                    {m.id}
                  </span>
                </span>
                {currentSelector === m.selector && (
                  <Check size={12} className="shrink-0 text-accent" />
                )}
              </button>
            ))}
          </div>
        ))}

        {items.length === 0 && (
          <button
            onClick={() => {
              setOpen(false)
              navigate('/settings')
            }}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-cream-dim transition hover:bg-overlay hover:text-cream"
          >
            <KeyRound size={12} />
            {t('composer.noModels')}
          </button>
        )}
      </MenuPortal>
    </div>
  )
}
