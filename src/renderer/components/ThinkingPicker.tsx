import { useEffect, useRef, useState } from 'react'
import { Brain, Check, ChevronUp } from 'lucide-react'
import { ThinkingLevel } from '@shared/types'
import { useAppStore } from '../store'
import { useT, I18nKey } from '../i18n'
import MenuPortal from './MenuPortal'

/** Levels offered in the composer, least to most intensive. */
const LEVELS: Array<{ id: ThinkingLevel; labelKey: I18nKey }> = [
  { id: 'off', labelKey: 'composer.thinkingOff' },
  { id: 'minimal', labelKey: 'composer.thinkingMinimal' },
  { id: 'low', labelKey: 'composer.thinkingLow' },
  { id: 'medium', labelKey: 'composer.thinkingMedium' },
  { id: 'high', labelKey: 'composer.thinkingHigh' },
  { id: 'xhigh', labelKey: 'composer.thinkingXhigh' },
  { id: 'max', labelKey: 'composer.thinkingMax' }
]

/**
 * Display a runtime-reported level. Known values render via i18n; unknown
 * future levels (e.g. a new "ultra") still render readably instead of
 * breaking the picker. undefined means the runtime's "auto".
 */
function levelLabel(raw: string | undefined, t: ReturnType<typeof useT>): string {
  if (!raw) return t('composer.thinkingAuto')
  const known = LEVELS.find((l) => l.id === raw)
  if (known) return t(known.labelKey)
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

interface ThinkingPickerProps {
  /** Live session to read/change; without one the picker sets the default. */
  sessionId: string | null
}

/**
 * Thinking-level dropdown next to the model picker. With a live session it
 * switches the session's level immediately (even mid-stream); without one it
 * edits the runtime default used by future sessions.
 *
 * Display follows runtime-resolved state, never the optimistic request:
 * current runtimes may clamp an unsupported level (e.g. xhigh → high on a
 * model that tops out at high) — the thinking_level_changed event reports
 * what actually happened.
 */
export default function ThinkingPicker({ sessionId }: ThinkingPickerProps) {
  const [level, setLevel] = useState<string | undefined>(undefined)
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const t = useT()
  const overview = useAppStore((s) => s.runtimeOverview)
  const eventLevel = useAppStore((s) => (sessionId ? s.sessionThinking[sessionId] : undefined))
  const hasEventLevel = useAppStore((s) => sessionId !== null && sessionId in s.sessionThinking)

  // Sync the current level: event-resolved first, then a one-time probe.
  useEffect(() => {
    if (hasEventLevel) {
      setLevel(eventLevel)
      setLoaded(true)
      return
    }
    setLoaded(false)
    let cancelled = false
    if (sessionId) {
      window.electronAPI.getSessionState(sessionId).then((state) => {
        if (!cancelled) {
          setLevel(state?.thinkingLevel ?? undefined)
          setLoaded(true)
        }
      })
    } else if (overview?.profile === 'current') {
      setLevel(overview.modelState.defaultThinkingLevel || undefined)
      setLoaded(true)
    } else {
      window.electronAPI.getModelConfig().then((cfg) => {
        if (!cancelled) {
          setLevel(cfg.defaultThinkingLevel || undefined)
          setLoaded(true)
        }
      })
    }
    return () => {
      cancelled = true
    }
  }, [sessionId, hasEventLevel, eventLevel, overview?.profile, overview?.modelState.defaultThinkingLevel])

  const pick = async (next: ThinkingLevel) => {
    setOpen(false)
    // Persist the default for future sessions (profile-appropriate path)…
    if (overview?.profile === 'current') {
      await useAppStore.getState().setRuntimeDefaultThinking(next)
    } else {
      await window.electronAPI.setModelConfig({ defaultThinkingLevel: next })
    }
    // …and hot-switch the live session when there is one. The display does
    // NOT optimistic-update here on current runtimes: the runtime resolves
    // (and may clamp) the level, reported back via thinking_level_changed.
    if (sessionId) {
      await window.electronAPI.setThinkingLevel(sessionId, next)
      if (overview?.profile !== 'current') setLevel(next)
    } else {
      setLevel(next)
    }
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        className="focus-ring flex shrink-0 items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[12px] font-medium whitespace-nowrap text-cream-dim transition-all hover:border-ink-600 hover:text-cream"
        title={t('composer.thinking')}
      >
        <Brain size={12} />
        <span>
          {t('composer.thinking')} · {loaded ? levelLabel(level, t) : '—'}
        </span>
        <ChevronUp size={11} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>

      <MenuPortal open={open} triggerRef={triggerRef} onClose={() => setOpen(false)} width={128}>
        {LEVELS.map((l) => (
          <button
            key={l.id}
            onClick={() => pick(l.id)}
            className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-cream transition hover:bg-overlay"
          >
            <span>{t(l.labelKey)}</span>
            {level === l.id && <Check size={12} className="text-accent" />}
          </button>
        ))}
      </MenuPortal>
    </div>
  )
}
