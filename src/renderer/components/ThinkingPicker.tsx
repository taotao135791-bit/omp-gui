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
        className="focus-ring flex items-center gap-1.5 rounded-lg border border-transparent px-2 py-1.5 text-[11px] font-medium text-cream-dim transition-colors hover:border-line hover:bg-overlay hover:text-cream disabled:cursor-not-allowed disabled:opacity-40"
        title={t('composer.thinking')}
      >
        <Brain size={13} />
        <span>
          {t('composer.thinking')} · {current ? t(current.labelKey) : '—'}
        </span>
        <ChevronUp size={11} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && sessionId && (
        <div className="absolute bottom-full left-0 z-30 mb-1.5 w-32 rounded-xl border border-line bg-ink-900 p-1 shadow-pop">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              onClick={() => pick(l.id)}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] text-cream transition hover:bg-ink-800"
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
