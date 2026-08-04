import { useState } from 'react'
import { ChevronDown, ChevronRight, Terminal } from 'lucide-react'
import { useT } from '../i18n'

interface ToolCallCardProps {
  toolCall: {
    tool: string
    input: unknown
    output?: unknown
    isError?: boolean
  }
}

export default function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false)
  const t = useT()

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-overlay font-mono text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-overlay"
      >
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            toolCall.isError
              ? 'bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.7)]'
              : toolCall.output === undefined
                ? 'animate-pulse bg-yellow-400'
                : 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.7)]'
          }`}
        />
        <Terminal size={12} className="shrink-0 text-accent" />
        <span className="font-medium text-cream">{toolCall.tool}</span>
        <span className="ml-auto text-cream-faint">
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
      </button>
      {expanded && (
        <div className="space-y-2.5 border-t border-line px-3 py-2.5">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.15em] text-cream-faint">
              {t('tool.input')}
            </div>
            <pre className="max-h-48 overflow-auto rounded-lg bg-ink-800 p-2.5 leading-5 text-cream/80">
              {JSON.stringify(toolCall.input, null, 2)}
            </pre>
          </div>
          {toolCall.output !== undefined && (
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-[0.15em] text-cream-faint">
                {t('tool.output')}
              </div>
              <pre className="max-h-48 overflow-auto rounded-lg bg-ink-800 p-2.5 leading-5 text-cream/80">
                {JSON.stringify(toolCall.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
