import { useEffect, useRef, useState } from 'react'
import { Brain, Check, ChevronUp } from 'lucide-react'
import { ThinkingLevel } from '@shared/types'
import { useT, I18nKey } from '../i18n'

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
  /** Live session to read/change; the picker is disabled without one. */
  sessionId: string | null
}

/**
 * Thinking-level dropdown next to the model picker. Reads the current level
 * from the live session (get_state) whenever the session changes; picking a
 * level applies immediately, even mid-stream.
 */
export default function ThinkingPicker({ sessionId }: ThinkingPickerProps) {
  const [level, setLevel] = useState<ThinkingLevel | null>(null)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const t = useT()

  // Sync the current level from the session whenever it changes
  useEffect(() => {
    setLevel(null)
    if (!sessionId) return
    let cancelled = false
    window.electronAPI.getSessionState(sessionId).then((state) => {
      if (!cancelled && state) setLevel(displayLevel(state.thinkingLevel))
    })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const pick = async (next: ThinkingLevel) => {
    setOpen(false)
    if (!sessionId) return
    setLevel(next)
    await window.electronAPI.setThinkingLevel(sessionId, next)
  }

  const current = LEVELS.find((l) => l.id === level)

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={!sessionId}
        className="focus-ring flex shrink-0 items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[12px] font-medium whitespace-nowrap text-cream-dim transition-all hover:border-ink-600 hover:text-cream disabled:cursor-not-allowed disabled:opacity-40"
        title={t('composer.thinking')}
      >
        <Brain size={12} />
        <span>
          {t('composer.thinking')} · {current ? t(current.labelKey) : '—'}
        </span>
        <ChevronUp size={11} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && sessionId && (
        <div className="absolute bottom-full left-0 z-30 mb-1.5 w-32 rounded-xl border border-line bg-ink-850 p-1 shadow-pop">
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
        </div>
      )}
    </div>
  )
}
