import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { BoardDataset, BoardWidget } from '@shared/types'
import { BOARD_LIMITS, isValidLinkUrl } from '@shared/boards'
import { DATASET_OPS, DatasetOp } from '@shared/datasets'
import { useT, I18nKey } from '../../i18n'

/**
 * In-card widget configuration layer: covers the widget body with a small
 * form (title + per-type fields). Saving writes the whole widget back and
 * persists the board. Remounted per widget via React key, so local drafts
 * always initialize from the widget being configured.
 *
 * Counter/line/bar widgets have two data sources: manual (the historic
 * value/points fields) and dataset (a binding onto an imported dataset:
 * datasetId + metric column + aggregation op, plus a dimension column for
 * charts). Both sides' drafts live in state and are written back together,
 * so toggling the source never discards the other side's input.
 */

interface WidgetConfigPanelProps {
  widget: BoardWidget
  datasets: BoardDataset[]
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

export function WidgetConfigPanel({ widget, datasets, onClose, onSave }: WidgetConfigPanelProps) {
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

  // Dataset binding (counter / chart-line / chart-bar only).
  const supportsDataset =
    widget.type === 'counter' || widget.type === 'chart-line' || widget.type === 'chart-bar'
  const isChart = widget.type === 'chart-line' || widget.type === 'chart-bar'
  const [source, setSource] = useState<'manual' | 'dataset'>(
    widget.config.source === 'dataset' ? 'dataset' : 'manual'
  )
  const [datasetId, setDatasetId] = useState(configString(widget, 'datasetId'))
  const [metric, setMetric] = useState(configString(widget, 'metric'))
  const [op, setOp] = useState<DatasetOp>(() =>
    (DATASET_OPS as readonly string[]).includes(widget.config.op as string)
      ? (widget.config.op as DatasetOp)
      : 'sum'
  )
  const [dimension, setDimension] = useState(configString(widget, 'dimension'))

  const selectedDataset = datasets.find((d) => d.id === datasetId)
  const metricColumns = (selectedDataset?.columns ?? []).filter((c) => c.type === 'number')
  const datasetIncomplete =
    supportsDataset && source === 'dataset' && (!datasetId || !metric || (isChart && !dimension))

  /** Dataset fields kept alongside the manual ones so toggling loses nothing. */
  const bindingConfig = (): Record<string, unknown> => {
    const config: Record<string, unknown> = { source, op }
    if (datasetId) config.datasetId = datasetId
    if (metric) config.metric = metric
    if (isChart && dimension) config.dimension = dimension
    return config
  }

  const handleSave = () => {
    if (datasetIncomplete) return
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
          label: label.slice(0, BOARD_LIMITS.maxLabelLength),
          ...bindingConfig()
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
        config = { points, labels, ...bindingConfig() }
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
        {supportsDataset && (
          <Field label={t('boards.config.source')}>
            <div className="flex rounded-lg border border-line bg-ink-850 p-0.5">
              {(['manual', 'dataset'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSource(s)}
                  className={`flex-1 rounded-md px-2 py-1 text-[11px] transition ${
                    source === s ? 'bg-cream text-ink-950' : 'text-cream-dim hover:text-cream'
                  }`}
                >
                  {s === 'manual' ? t('boards.config.sourceManual') : t('boards.config.sourceDataset')}
                </button>
              ))}
            </div>
          </Field>
        )}
        {widget.type === 'gauge' && (
          <>
            <Field label={t('boards.config.value')}>
              <input
                value={numValue}
                onChange={(e) => setNumValue(e.target.value)}
                inputMode="decimal"
                placeholder="0 – 100"
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
        {widget.type === 'counter' && source === 'manual' && (
          <Field label={t('boards.config.value')}>
            <input
              value={numValue}
              onChange={(e) => setNumValue(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              className={inputClass}
            />
          </Field>
        )}
        {widget.type === 'counter' && (
          <Field label={t('boards.config.label')}>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={BOARD_LIMITS.maxLabelLength}
              className={inputClass}
            />
          </Field>
        )}
        {isChart && source === 'manual' && (
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
        {supportsDataset && source === 'dataset' && (
          <>
            {datasets.length === 0 ? (
              <p className="text-[11px] leading-4 text-cream-faint">
                {t('boards.config.noDatasets')}
              </p>
            ) : (
              <>
                <Field label={t('boards.config.dataset')}>
                  <select
                    value={datasetId}
                    onChange={(e) => {
                      setDatasetId(e.target.value)
                      setMetric('')
                      setDimension('')
                    }}
                    className={inputClass}
                  >
                    <option value="">{t('boards.config.pickDataset')}</option>
                    {datasets.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t('boards.config.metric')}>
                  <select
                    value={metric}
                    onChange={(e) => setMetric(e.target.value)}
                    disabled={!selectedDataset}
                    className={inputClass}
                  >
                    <option value="">{t('boards.config.pickColumn')}</option>
                    {metricColumns.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t('boards.config.op')}>
                  <select
                    value={op}
                    onChange={(e) => setOp(e.target.value as DatasetOp)}
                    className={inputClass}
                  >
                    {DATASET_OPS.map((o) => (
                      <option key={o} value={o}>
                        {t(`boards.config.op.${o}` as I18nKey)}
                      </option>
                    ))}
                  </select>
                </Field>
                {isChart && (
                  <Field label={t('boards.config.dimension')}>
                    <select
                      value={dimension}
                      onChange={(e) => setDimension(e.target.value)}
                      disabled={!selectedDataset}
                      className={inputClass}
                    >
                      <option value="">{t('boards.config.pickColumn')}</option>
                      {(selectedDataset?.columns ?? []).map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </>
            )}
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
          disabled={datasetIncomplete}
          className="flex items-center gap-1 rounded-full bg-cream px-2.5 py-1 text-[11px] font-medium text-ink-950 transition hover:opacity-90 disabled:opacity-40"
        >
          <Check size={10} />
          {t('boards.save')}
        </button>
      </div>
    </div>
  )
}
