import { useCallback, useEffect, useState } from 'react'
import { MessageCircleQuestion, X } from 'lucide-react'
import { ExtensionUiAnswer } from '@shared/types'
import { UiRequest, useAppStore } from '../store'
import { useT } from '../i18n'

/**
 * Modal dialog for pi extension UI requests (select / confirm / input / editor).
 * Extensions pause mid-turn until the answer goes back over the session stdin;
 * cancelling returns `{ cancelled: true }`, which pi treats as a dismissed dialog.
 *
 * A request may carry a timeout (ms). The runtime resolves the dialog with its
 * default at the deadline WITHOUT notifying the client, so the dialog runs its
 * own countdown and cancels itself — otherwise it would sit there stale.
 */
export default function ExtensionUiDialog({
  sessionId,
  request
}: {
  sessionId: string
  request: UiRequest
}) {
  const t = useT()
  const resolveUiRequest = useAppStore((s) => s.resolveUiRequest)
  const [text, setText] = useState(request.method === 'editor' ? request.prefill ?? '' : '')
  const [sending, setSending] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(
    request.timeout !== undefined ? Math.ceil(request.timeout / 1000) : null
  )

  useEffect(() => {
    setText(request.method === 'editor' ? request.prefill ?? '' : '')
    setSending(false)
    setRemaining(request.timeout !== undefined ? Math.ceil(request.timeout / 1000) : null)
  }, [request.id, request.method, request.prefill, request.timeout])

  const answer = useCallback(
    async (a: ExtensionUiAnswer) => {
      if (sending) return
      setSending(true)
      try {
        await window.electronAPI.respondUi(sessionId, request.id, a)
      } finally {
        // Resolved locally even if the write failed — the session is likely dead
        // and the store clears leftovers on closed/error anyway.
        resolveUiRequest(sessionId, request.id)
      }
    },
    [sending, sessionId, request.id, resolveUiRequest]
  )

  // Countdown to the runtime's deadline: auto-cancel when it hits zero.
  useEffect(() => {
    if (remaining === null) return
    if (remaining <= 0) {
      void answer({ cancelled: true })
      return
    }
    const timer = setTimeout(() => setRemaining((r) => (r === null ? null : r - 1)), 1000)
    return () => clearTimeout(timer)
  }, [remaining, answer])

  // Escape cancels the dialog (same as the X / Cancel button).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        void answer({ cancelled: true })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [answer])

  const isTextual = request.method === 'input' || request.method === 'editor'

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-ink-950/30 p-6 backdrop-blur-[2px]">
      <div className="msg-in w-full max-w-[420px] rounded-[18px] border border-line bg-ink-850 shadow-pop">
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
            <MessageCircleQuestion size={14} strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[14px] font-semibold text-cream">
              {request.title || t('uiDialog.untitled')}
            </h3>
            <p className="mt-0.5 text-[11px] text-cream-faint">
              {t('uiDialog.subtitle')}
              {remaining !== null && ` · ${t('uiDialog.timeout', { count: remaining })}`}
            </p>
          </div>
          <button
            onClick={() => answer({ cancelled: true })}
            className="rounded-md p-1 text-cream-faint transition hover:bg-overlay hover:text-cream"
            title={t('uiDialog.cancel')}
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-4">
          {request.method === 'select' && (
            <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
              {/* Approval-style requests pack a command summary into a long
                  title; show it in full as a mono block the header can't fit. */}
              {request.title.length > 48 && (
                <div className="mb-1 whitespace-pre-wrap break-words rounded-lg bg-ink-800 p-3 font-mono text-[12px] leading-5 text-cream/85">
                  {request.title}
                </div>
              )}
              {(request.options ?? []).map((option, i) => (
                <button
                  key={option}
                  onClick={() => answer({ value: option })}
                  className={`rounded-lg border px-3 py-2 text-left text-[13px] transition ${
                    i === 0
                      ? 'border-accent/60 text-cream hover:bg-accent-soft'
                      : 'border-line text-cream hover:border-ink-600 hover:bg-overlay'
                  }`}
                >
                  {option}
                </button>
              ))}
              {(request.options ?? []).length === 0 && (
                <p className="text-[12px] text-cream-faint">{t('uiDialog.noOptions')}</p>
              )}
              <button
                onClick={() => answer({ cancelled: true })}
                className="mt-0.5 rounded-lg border border-line px-3 py-2 text-left text-[13px] text-cream-dim transition hover:border-red-500/40 hover:text-red-500"
              >
                {t('uiDialog.cancel')}
              </button>
            </div>
          )}

          {request.method === 'confirm' && (
            <>
              <p className="mb-4 whitespace-pre-wrap text-[13px] leading-6 text-cream-dim">
                {request.message}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => answer({ confirmed: false })}
                  className="rounded-lg border border-line px-4 py-2 text-[13px] text-cream-dim transition hover:border-red-500/40 hover:text-red-500"
                >
                  {t('uiDialog.deny')}
                </button>
                <button
                  onClick={() => answer({ confirmed: true })}
                  className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white transition hover:bg-accent-bright"
                >
                  {t('uiDialog.allow')}
                </button>
              </div>
            </>
          )}

          {isTextual && (
            <>
              {request.method === 'editor' ? (
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={8}
                  autoFocus
                  className="mb-4 w-full resize-y rounded-lg border border-line bg-ink-800 px-3 py-2.5 font-mono text-[12px] leading-5 text-cream outline-none transition-all focus:border-accent/50 focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                />
              ) : (
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={request.placeholder}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') answer({ value: text })
                  }}
                  className="mb-4 w-full rounded-lg border border-line bg-ink-800 px-3 py-2.5 text-[13px] text-cream outline-none transition-all placeholder:text-cream-faint focus:border-accent/50 focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                />
              )}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => answer({ cancelled: true })}
                  className="rounded-lg border border-line px-4 py-2 text-[13px] text-cream-dim transition hover:border-red-500/40 hover:text-red-500"
                >
                  {t('uiDialog.cancel')}
                </button>
                <button
                  onClick={() => answer({ value: text })}
                  className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white transition hover:bg-accent-bright"
                >
                  {t('uiDialog.submit')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
