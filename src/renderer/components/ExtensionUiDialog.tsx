import { useEffect, useState } from 'react'
import { MessageCircleQuestion, X } from 'lucide-react'
import { ExtensionUiAnswer } from '@shared/types'
import { UiRequest, useAppStore } from '../store'
import { useT } from '../i18n'

/**
 * Modal dialog for pi extension UI requests (select / confirm / input / editor).
 * Extensions pause mid-turn until the answer goes back over the session stdin;
 * cancelling returns `{ cancelled: true }`, which pi treats as a dismissed dialog.
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

  useEffect(() => {
    setText(request.method === 'editor' ? request.prefill ?? '' : '')
    setSending(false)
  }, [request.id, request.method, request.prefill])

  const answer = async (a: ExtensionUiAnswer) => {
    if (sending) return
    setSending(true)
    try {
      await window.electronAPI.respondUi(sessionId, request.id, a)
    } finally {
      // Resolved locally even if the write failed — the session is likely dead
      // and the store clears leftovers on closed/error anyway.
      resolveUiRequest(sessionId, request.id)
    }
  }

  const isTextual = request.method === 'input' || request.method === 'editor'

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/30 p-6 backdrop-blur-[2px]">
      <div className="msg-in w-full max-w-md rounded-xl border border-line bg-ink-900 shadow-pop">
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
            <MessageCircleQuestion size={14} strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[14px] font-medium text-cream">
              {request.title || t('uiDialog.untitled')}
            </h3>
            <p className="mt-0.5 text-[11px] text-cream-faint">{t('uiDialog.subtitle')}</p>
          </div>
          <button
            onClick={() => answer({ cancelled: true })}
            className="rounded-md p-1 text-cream-faint transition hover:bg-ink-800 hover:text-cream"
            title={t('uiDialog.cancel')}
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-4">
          {request.method === 'select' && (
            <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
              {(request.options ?? []).map((option) => (
                <button
                  key={option}
                  onClick={() => answer({ value: option })}
                  className="rounded-lg border border-line bg-ink-850 px-3.5 py-2.5 text-left text-[13px] text-cream transition hover:border-accent hover:bg-ink-800"
                >
                  {option}
                </button>
              ))}
              {(request.options ?? []).length === 0 && (
                <p className="text-[12px] text-cream-faint">{t('uiDialog.noOptions')}</p>
              )}
            </div>
          )}

          {request.method === 'confirm' && (
            <>
              <p className="mb-4 whitespace-pre-wrap text-[13px] leading-6 text-cream">
                {request.message}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => answer({ confirmed: false })}
                  className="rounded-lg border border-line px-4 py-2 text-[13px] text-cream-dim transition hover:border-ink-600 hover:text-cream"
                >
                  {t('uiDialog.deny')}
                </button>
                <button
                  onClick={() => answer({ confirmed: true })}
                  className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white transition hover:opacity-90"
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
                  className="mb-4 w-full resize-y rounded-lg border border-line bg-ink-850 px-3 py-2.5 font-mono text-[12px] leading-5 text-cream outline-none transition focus:border-accent"
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
                  className="mb-4 w-full rounded-lg border border-line bg-ink-850 px-3 py-2.5 text-[13px] text-cream outline-none transition placeholder:text-cream-faint focus:border-accent"
                />
              )}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => answer({ cancelled: true })}
                  className="rounded-lg border border-line px-4 py-2 text-[13px] text-cream-dim transition hover:border-ink-600 hover:text-cream"
                >
                  {t('uiDialog.cancel')}
                </button>
                <button
                  onClick={() => answer({ value: text })}
                  className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white transition hover:opacity-90"
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
