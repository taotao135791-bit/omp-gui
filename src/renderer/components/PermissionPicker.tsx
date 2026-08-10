import { useEffect, useRef, useState } from 'react'
import { Check, ChevronUp, Shield } from 'lucide-react'
import { PermissionMode } from '@shared/types'
import { useAppStore } from '../store'
import { I18nKey, useT } from '../i18n'
import MenuPortal from './MenuPortal'

/**
 * Permission-mode pill in the composer toolbar. ask/full flip the live
 * session's approval config on the spot (the extension re-reads it per tool
 * call); no-bash/readonly are spawn-time --exclude-tools, so they're flagged
 * as new-session-only.
 */
const MODES: { value: PermissionMode; labelKey: I18nKey; noteKey?: I18nKey }[] = [
  { value: 'ask', labelKey: 'settings.permissions.ask' },
  { value: 'full', labelKey: 'settings.permissions.full' },
  { value: 'no-bash', labelKey: 'settings.permissions.noBash', noteKey: 'composer.permissionNewSession' },
  { value: 'readonly', labelKey: 'settings.permissions.readonly', noteKey: 'composer.permissionNewSession' }
]

export default function PermissionPicker() {
  const [mode, setMode] = useState<PermissionMode | null>(null)
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const t = useT()
  const currentSessionId = useAppStore((s) => s.currentSessionId)

  useEffect(() => {
    window.electronAPI.getStore('permissionMode').then((v) => setMode(v ?? 'ask'))
  }, [])

  const pick = async (next: PermissionMode) => {
    setOpen(false)
    setMode(next)
    // Default for future sessions…
    await window.electronAPI.setStore('permissionMode', next)
    // …plus a hot-swap of the live session's approval config, when possible
    if (currentSessionId) {
      await window.electronAPI.updateApprovalConfig(currentSessionId, next)
    }
  }

  const current = MODES.find((m) => m.value === mode)

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        className="focus-ring flex shrink-0 items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[12px] font-medium whitespace-nowrap text-cream-dim transition-all hover:border-ink-600 hover:text-cream"
        title={t('composer.permissions')}
      >
        <Shield size={12} />
        <span>{current ? t(current.labelKey) : '—'}</span>
        <ChevronUp size={11} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>

      <MenuPortal open={open} triggerRef={triggerRef} onClose={() => setOpen(false)} width={176}>
        {MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => pick(m.value)}
            className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-cream transition hover:bg-overlay"
          >
            <span className="min-w-0">
              <span className="block truncate">{t(m.labelKey)}</span>
              {m.noteKey && (
                <span className="block truncate text-[10px] text-cream-faint">{t(m.noteKey)}</span>
              )}
            </span>
            {mode === m.value && <Check size={12} className="shrink-0 text-accent" />}
          </button>
        ))}
      </MenuPortal>
    </div>
  )
}
