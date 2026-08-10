import { useEffect, useRef, useState } from 'react'
import { Brain, Check, ChevronUp } from 'lucide-react'
import { ThinkingLevel } from '@shared/types'
import { useT, I18nKey } from '../i18n'
import MenuPortal from './MenuPortal'

/** The four levels offered in the composer (pi accepts six; we keep it simple). */
const LEVELS: Array<{ id: ThinkingLevel; labelKey: I18nKey }> = [
  { id: 'off', labelKey: 'composer.thinkingOff' },
  { id: 'low', labelKey: 'composer.thinkingLow' },
  { id: 'medium', labelKey: 'composer.thinkingMedium' },
  { id: 'high', labelKey: 'composer.thinkingHigh' }
]

/** Map pi's six-level value onto the four offered here, for display. */
function displayLevel(raw: string | undefined): ThinkingLevel {
  switch (raw) {
    case 'off':
      return 'off'
    case 'minimal':
    case 'low':
      return 'low'
    case 'high':
    case 'xhigh':
      return 'high'
    default:
      return 'medium'
  }
}

interface ThinkingPickerProps {
  /** Live session to read/change; without one the picker sets the default. */
  sessionId: string | null
}

/**
 * Thinking-level dropdown next to the model picker. With a live session it
 * reads/switches the session's level immediately (even mid-stream); without
 * one it edits the default level used by future sessions, so it's never a
 * dead control on the welcome screen.
 */
export default function ThinkingPicker({ sessionId }: ThinkingPickerProps) {
  const [level, setLevel] = useState<ThinkingLevel | null>(null)
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const t = useT()

  // Sync the current level: from the live session, else from the default
  useEffect(() => {
    setLevel(null)
    let cancelled = false
    if (sessionId) {
      window.electronAPI.getSessionState(sessionId).then((state) => {
        if (!cancelled && state) setLevel(displayLevel(state.thinkingLevel))
      })
    } else {
      window.electronAPI.getModelConfig().then((cfg) => {
        if (!cancelled) setLevel(displayLevel(cfg.defaultThinkingLevel || undefined))
      })
    }
    return () => {
      cancelled = true
    }
  }, [sessionId])

  const pick = async (next: ThinkingLevel) => {
    setOpen(false)
    setLevel(next)
    // Always persist as the default for future sessions…
    await window.electronAPI.setModelConfig({ defaultThinkingLevel: next })
    // …and hot-switch the live session when there is one
    if (sessionId) await window.electronAPI.setThinkingLevel(sessionId, next)
  }

  const current = LEVELS.find((l) => l.id === level)

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
          {t('composer.thinking')} · {current ? t(current.labelKey) : '—'}
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
