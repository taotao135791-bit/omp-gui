import { useEffect, useState } from 'react'
import { Check, ExternalLink, X } from 'lucide-react'
import { BoardWidget } from '@shared/types'
import { TodoItem, isValidLinkUrl } from '@shared/boards'
import { useAppStore } from '../../store'
import { useT } from '../../i18n'

/**
 * Per-type widget bodies for the board grid. All painting is hand-rolled SVG
 * (no chart library); interactive bodies (todo, link) write back through
 * `onConfigChange`, which the page persists immediately as a whole-board
 * upsert. The page remounts bodies (via React key) when the toolbar refresh
 * button is pressed, so live widgets re-render on demand.
 */

export interface WidgetBodyProps {
  widget: BoardWidget
  onConfigChange: (config: Record<string, unknown>) => void
}

function ClockBody({ widget }: { widget: BoardWidget }) {
  const language = useAppStore((s) => s.language)
  const showSeconds = widget.config.showSeconds !== false
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])
  const locale = language === 'zh' ? 'zh-CN' : 'en-US'
  const time = now.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...(showSeconds ? { second: '2-digit' as const } : {})
  })
  const date = now.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5">
      <div className="font-mono text-[32px] leading-none tabular-nums tracking-wide text-cream">
        {time}
      </div>
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-cream-faint">{date}</div>
    </div>
  )
}

function NoteBody({ widget }: { widget: BoardWidget }) {
  const t = useT()
  const text = typeof widget.config.text === 'string' ? widget.config.text : ''
  if (!text) {
    return (
      <div className="flex h-full items-center justify-center text-[11px] text-cream-faint">
        {t('boards.noteEmpty')}
      </div>
    )
  }
  return (
    <div className="h-full overflow-y-auto whitespace-pre-wrap break-words text-[12.5px] leading-5 text-cream-dim">
      {text}
    </div>
  )
}

function CounterBody({ widget }: { widget: BoardWidget }) {
  const value = typeof widget.config.value === 'number' ? widget.config.value : 0
  const label = typeof widget.config.label === 'string' ? widget.config.label : ''
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5">
      <div className="break-all text-center font-mono text-[38px] leading-none tabular-nums text-cream">
        {value.toLocaleString()}
      </div>
      {label && (
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-cream-faint">{label}</div>
      )}
    </div>
  )
}

/** Semicircle gauge: background arc + accent value arc + needle + readout. */
function GaugeBody({ widget }: { widget: BoardWidget }) {
  const raw = typeof widget.config.value === 'number' ? widget.config.value : 0
  const value = Math.min(100, Math.max(0, raw))
  const label = typeof widget.config.label === 'string' ? widget.config.label : ''
  const angle = Math.PI * (1 - value / 100)
  const x = 100 + 80 * Math.cos(angle)
  const y = 100 - 80 * Math.sin(angle)
  const nx = 100 + 54 * Math.cos(angle)
  const ny = 100 - 54 * Math.sin(angle)
  const largeArc = value > 50 ? 1 : 0
  return (
    <div className="flex h-full items-center justify-center">
      <svg viewBox="0 0 200 112" className="max-h-full w-full">
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="var(--overlay-strong)"
          strokeWidth={10}
          strokeLinecap="round"
        />
        {value > 0 && (
          <path
            d={`M 20 100 A 80 80 0 ${largeArc} 1 ${x.toFixed(2)} ${y.toFixed(2)}`}
            fill="none"
            stroke="rgb(var(--accent))"
            strokeWidth={10}
            strokeLinecap="round"
          />
        )}
        <line
          x1={100}
          y1={100}
          x2={nx.toFixed(2)}
          y2={ny.toFixed(2)}
          stroke="rgb(var(--text))"
          strokeWidth={1.5}
        />
        <circle cx={100} cy={100} r={3} fill="rgb(var(--text))" />
        <text
          x={100}
          y={90}
          textAnchor="middle"
          fontSize={26}
          className="fill-cream font-mono tabular-nums"
        >
          {Math.round(value)}
        </text>
        {label && (
          <text x={100} y={106} textAnchor="middle" fontSize={9} className="fill-cream-faint">
            {label}
          </text>
        )}
      </svg>
    </div>
  )
}

function chartFormat(v: number): string {
  if (Math.abs(v) >= 1000) return `${Math.round(v / 100) / 10}k`
  return `${Math.round(v * 100) / 100}`
}

/** Hand-rolled SVG line/bar chart with gridlines and min/mid/max readouts. */
function ChartBody({ widget, bar }: { widget: BoardWidget; bar: boolean }) {
  const t = useT()
  const points = Array.isArray(widget.config.points)
    ? (widget.config.points as unknown[]).filter(
        (n): n is number => typeof n === 'number' && Number.isFinite(n)
      )
    : []
  const labels = Array.isArray(widget.config.labels)
    ? (widget.config.labels as unknown[]).filter((s): s is string => typeof s === 'string')
    : []
  if (points.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[11px] text-cream-faint">
        {t('boards.chartEmpty')}
      </div>
    )
  }
  const W = 320
  const H = 120
  const padL = 30
  const padR = 6
  const padT = 8
  const padB = 16
  const iw = W - padL - padR
  const ih = H - padT - padB
  let min = Math.min(...points)
  const max = Math.max(...points)
  if (min === max) min = max - 1
  const lo = bar ? Math.min(0, min) : min
  const span = max - lo || 1
  const px = (i: number) => padL + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw)
  const py = (v: number) => padT + ih - ((v - lo) / span) * ih
  const gridVals = [lo, lo + span / 2, max]
  const firstLabel = labels[0]
  const lastLabel = labels.length > 1 ? labels[labels.length - 1] : undefined
  const zeroY = py(0)

  return (
    <div className="flex h-full items-center justify-center">
      <svg viewBox={`0 0 ${W} ${H}`} className="max-h-full w-full">
        {gridVals.map((v) => (
          <g key={v}>
            <line
              x1={padL}
              y1={py(v)}
              x2={W - padR}
              y2={py(v)}
              stroke="var(--line)"
              strokeWidth={1}
            />
            <text x={padL - 4} y={py(v) + 2.5} textAnchor="end" fontSize={7.5} className="fill-cream-faint">
              {chartFormat(v)}
            </text>
          </g>
        ))}
        {bar && lo < 0 && (
          <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="var(--line-strong)" strokeWidth={1} />
        )}
        {bar ? (
          points.map((v, i) => {
            const slot = iw / points.length
            const bw = Math.min(26, slot * 0.62)
            const bx = padL + slot * i + (slot - bw) / 2
            const top = py(Math.max(v, 0))
            const height = Math.max(1, Math.abs(py(v) - py(Math.max(lo, 0))))
            return (
              <rect
                key={i}
                x={bx}
                y={v >= 0 ? top : py(Math.max(lo, 0))}
                width={bw}
                height={height}
                rx={1.5}
                className="fill-accent/80"
              />
            )
          })
        ) : (
          <>
            <path
              d={`${points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${px(i).toFixed(2)} ${py(v).toFixed(2)}`).join(' ')} L ${px(points.length - 1).toFixed(2)} ${py(lo).toFixed(2)} L ${px(0).toFixed(2)} ${py(lo).toFixed(2)} Z`}
              className="fill-accent/10"
            />
            <polyline
              points={points.map((v, i) => `${px(i).toFixed(2)},${py(v).toFixed(2)}`).join(' ')}
              fill="none"
              stroke="rgb(var(--accent))"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {points.length <= 40 &&
              points.map((v, i) => (
                <circle key={i} cx={px(i)} cy={py(v)} r={1.6} fill="rgb(var(--accent))" />
              ))}
          </>
        )}
        {firstLabel !== undefined && (
          <text x={padL} y={H - 4} fontSize={7.5} className="fill-cream-faint">
            {firstLabel}
          </text>
        )}
        {lastLabel !== undefined && (
          <text x={W - padR} y={H - 4} textAnchor="end" fontSize={7.5} className="fill-cream-faint">
            {lastLabel}
          </text>
        )}
      </svg>
    </div>
  )
}

function TodoBody({
  widget,
  onConfigChange
}: {
  widget: BoardWidget
  onConfigChange: (config: Record<string, unknown>) => void
}) {
  const t = useT()
  const items: TodoItem[] = Array.isArray(widget.config.items)
    ? (widget.config.items as TodoItem[])
    : []
  const [draft, setDraft] = useState('')
  const save = (next: TodoItem[]) => onConfigChange({ items: next })
  const add = () => {
    const text = draft.trim()
    setDraft('')
    if (!text) return
    save([...items, { id: crypto.randomUUID(), text: text.slice(0, 500), done: false }])
  }
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {items.length === 0 && (
          <div className="px-1.5 py-1 text-[11px] text-cream-faint">{t('boards.todoEmpty')}</div>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            className="group/item flex items-center gap-2 rounded-lg px-1.5 py-1 transition hover:bg-overlay"
          >
            <button
              onClick={() => save(items.map((it) => (it.id === item.id ? { ...it, done: !it.done } : it)))}
              title={item.done ? t('boards.todoUndone') : t('boards.todoDone')}
              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition ${
                item.done ? 'border-accent bg-accent text-ink-950' : 'border-ink-600 text-transparent'
              }`}
            >
              <Check size={10} strokeWidth={3} />
            </button>
            <span
              className={`min-w-0 flex-1 break-words text-[12px] leading-4 ${
                item.done ? 'text-cream-faint line-through' : 'text-cream'
              }`}
            >
              {item.text}
            </span>
            <button
              onClick={() => save(items.filter((it) => it.id !== item.id))}
              title={t('boards.todoRemove')}
              className="shrink-0 rounded p-0.5 text-cream-faint opacity-0 transition hover:bg-red-500/15 hover:text-red-500 group-hover/item:opacity-100"
            >
              <X size={11} />
            </button>
          </div>
        ))}
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') add()
        }}
        placeholder={t('boards.todoPlaceholder')}
        className="mt-1.5 w-full shrink-0 rounded-lg border border-line bg-ink-900 px-2 py-1 text-[12px] text-cream outline-none transition placeholder:text-cream-faint focus:border-accent/50"
      />
    </div>
  )
}

function LinkBody({ widget }: { widget: BoardWidget }) {
  const t = useT()
  const url = typeof widget.config.url === 'string' ? widget.config.url : ''
  let host = url
  try {
    host = new URL(url).host
  } catch {
    // Invalid URL — show it raw; the click guard below blocks opening it.
  }
  const open = () => {
    // Re-check at click time; the main process enforces the same policy.
    if (isValidLinkUrl(url)) void window.electronAPI.authOpenLoginUrl(url)
  }
  return (
    <button
      onClick={open}
      title={t('boards.linkOpen')}
      className="group/link flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-lg transition hover:bg-overlay"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent transition group-hover/link:bg-accent group-hover/link:text-ink-950">
        <ExternalLink size={14} />
      </span>
      <span className="max-w-full truncate px-2 font-mono text-[11px] text-cream-dim transition group-hover/link:text-accent">
        {host}
      </span>
    </button>
  )
}

export function WidgetBody({ widget, onConfigChange }: WidgetBodyProps) {
  switch (widget.type) {
    case 'clock':
      return <ClockBody widget={widget} />
    case 'note':
      return <NoteBody widget={widget} />
    case 'counter':
      return <CounterBody widget={widget} />
    case 'gauge':
      return <GaugeBody widget={widget} />
    case 'chart-line':
      return <ChartBody widget={widget} bar={false} />
    case 'chart-bar':
      return <ChartBody widget={widget} bar={true} />
    case 'todo':
      return <TodoBody widget={widget} onConfigChange={onConfigChange} />
    case 'link':
      return <LinkBody widget={widget} />
  }
}
