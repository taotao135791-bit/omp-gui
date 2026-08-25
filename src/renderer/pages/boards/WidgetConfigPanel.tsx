import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { BoardWidget } from '@shared/types'
import { BOARD_LIMITS, isValidLinkUrl } from '@shared/boards'
import { useT } from '../../i18n'

/**
 * In-card widget configuration layer: covers the widget body with a small
 * form (title + per-type fields). Saving writes the whole widget back and
 * persists the board. Remounted per widget via React key, so local drafts
 * always initialize from the widget being configured.
 */

interface WidgetConfigPanelProps {
  widget: BoardWidget
  onClose: () => void
  onSave: (patch: { title: string; config: Record<string, unknown> }) => void
}

const inputClass =
  'w-full rounded-lg border border-line bg-ink-850 px-2 py-1 text-[12px] text-cream outline-none transition placeholder:text-cream-faint focus:border-accent/50'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10.5px] text-cream-faint">{label}</span>
      {children}
    </label>
  )
}

function configString(widget: BoardWidget, key: string): string {
  const value = widget.config[key]
  return typeof value === 'string' ? value : ''
}

export function WidgetConfigPanel({ widget, onClose, onSave }: WidgetConfigPanelProps) {
  const t = useT()
  const [title, setTitle] = useState(widget.title)
  const [showSeconds, setShowSeconds] = useState(widget.config.showSeconds !== false)
  const [text, setText] = useState(configString(widget, 'text'))
  const [numValue, setNumValue] = useState(() => {
    const value = widget.config.value
    return typeof value === 'number' ? String(value) : ''
  })
  const [label, setLabel] = useState(configString(widget, 'label'))
  const [pointsText, setPointsText] = useState(() =>
    Array.isArray(widget.config.points) ? (widget.config.points as number[]).join(', ') : ''
  )
  const [labelsText, setLabelsText] = useState(() =>
    Array.isArray(widget.config.labels) ? (widget.config.labels as string[]).join(', ') : ''
  )
  const [url, setUrl] = useState(configString(widget, 'url'))
  const [urlInvalid, setUrlInvalid] = useState(false)

  const handleSave = () => {
    let config: Record<string, unknown>
    switch (widget.type) {
      case 'clock':
        config = { showSeconds }
        break
      case 'note':
        config = { text: text.slice(0, BOARD_LIMITS.maxNoteLength) }
        break
      case 'counter': {
        const value = Number(numValue)
        config = {
          value: Number.isFinite(value) ? value : 0,
          label: label.slice(0, BOARD_LIMITS.maxLabelLength)
        }
        break
      }
      case 'gauge': {
        let value = Number(numValue)
        if (!Number.isFinite(value)) value = 0
        config = {
          value: Math.min(100, Math.max(0, value)),
          label: label.slice(0, BOARD_LIMITS.maxLabelLength)
        }
        break
      }
      case 'chart-line':
      case 'chart-bar': {
        const points = pointsText
          .split(/[,，\s]+/)
          .map((s) => Number(s))
          .filter((n) => Number.isFinite(n))
          .slice(0, BOARD_LIMITS.maxChartPoints)
        const labels = labelsText
          .split(/[,，]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, BOARD_LIMITS.maxChartPoints)
        config = { points, labels }
        break
      }
      case 'todo':
        // Items are managed directly in the widget body — keep them as-is.
        config = { items: Array.isArray(widget.config.items) ? widget.config.items : [] }
        break
      case 'link': {
        const trimmed = url.trim()
        if (!isValidLinkUrl(trimmed)) {
          setUrlInvalid(true)
          return
        }
        config = { url: trimmed }
        break
      }
    }
    onSave({ title: title.trim() || widget.title, config })
  }

  return (
    <div
      className="widget-config absolute inset-0 z-20 flex flex-col rounded-[16px] border border-line bg-ink-900/95 p-3 backdrop-blur-sm"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex shrink-0 items-center justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-cream-faint">
          {t('boards.config')}
        </span>
        <button
          onClick={onClose}
          title={t('boards.cancel')}
          className="rounded-md p-1 text-cream-faint transition hover:bg-overlay hover:text-cream"
        >
          <X size={12} />
        </button>
      </div>
      <div className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto">
        <Field label={t('boards.config.title')}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={BOARD_LIMITS.maxWidgetTitleLength}
            className={inputClass}
          />
        </Field>
        {widget.type === 'clock' && (
          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-cream-dim">
            <input
              type="checkbox"
              checked={showSeconds}
              onChange={(e) => setShowSeconds(e.target.checked)}
              className="accent-[rgb(var(--accent))]"
            />
            {t('boards.config.showSeconds')}
          </label>
        )}
        {widget.type === 'note' && (
          <Field label={t('boards.config.note')}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              maxLength={BOARD_LIMITS.maxNoteLength}
              className={`${inputClass} resize-none leading-5`}
            />
          </Field>
        )}
        {(widget.type === 'counter' || widget.type === 'gauge') && (
          <>
            <Field label={t('boards.config.value')}>
              <input
                value={numValue}
                onChange={(e) => setNumValue(e.target.value)}
                inputMode="decimal"
                placeholder={widget.type === 'gauge' ? '0 – 100' : '0'}
                className={inputClass}
              />
            </Field>
            <Field label={t('boards.config.label')}>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={BOARD_LIMITS.maxLabelLength}
                className={inputClass}
              />
            </Field>
          </>
        )}
        {(widget.type === 'chart-line' || widget.type === 'chart-bar') && (
          <>
            <Field label={t('boards.config.points')}>
              <input
                value={pointsText}
                onChange={(e) => setPointsText(e.target.value)}
                placeholder="3, 5, 4, 7, 6"
                className={`${inputClass} font-mono`}
              />
            </Field>
            <Field label={t('boards.config.labels')}>
              <input
                value={labelsText}
                onChange={(e) => setLabelsText(e.target.value)}
                className={inputClass}
              />
            </Field>
          </>
        )}
        {widget.type === 'todo' && (
          <p className="text-[11px] leading-4 text-cream-faint">{t('boards.config.todoHint')}</p>
        )}
        {widget.type === 'link' && (
          <Field label={t('boards.config.url')}>
            <input
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                setUrlInvalid(false)
              }}
              placeholder="https://…"
              className={`${inputClass} font-mono`}
            />
          </Field>
        )}
        {urlInvalid && <p className="text-[10.5px] leading-4 text-red-500">{t('boards.config.invalidUrl')}</p>}
      </div>
      <div className="mt-2 flex shrink-0 justify-end gap-1.5">
        <button
          onClick={onClose}
          className="rounded-full border border-line px-2.5 py-1 text-[11px] text-cream-dim transition hover:border-ink-600 hover:text-cream"
        >
          {t('boards.cancel')}
        </button>
        <button
          onClick={handleSave}
          className="flex items-center gap-1 rounded-full bg-cream px-2.5 py-1 text-[11px] font-medium text-ink-950 transition hover:opacity-90"
        >
          <Check size={10} />
          {t('boards.save')}
        </button>
      </div>
    </div>
  )
}
