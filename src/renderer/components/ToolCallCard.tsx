import { useState } from 'react'
import { ChevronDown, ChevronRight, Terminal } from 'lucide-react'
import { useT } from '../i18n'

interface ToolCallCardProps {
  toolCall: {
    tool: string
    input: unknown
    output?: unknown
  }
}

export default function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false)
  const t = useT()

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-ink-900/60 font-mono text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-cream-dim transition hover:bg-white/[0.03] hover:text-cream"
      >
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <Terminal size={12} className="text-accent" />
        <span className="font-medium">{toolCall.tool}</span>
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-white/[0.06] px-3 py-2.5">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.15em] text-cream-faint">
              {t('tool.input')}
            </div>
            <pre className="max-h-48 overflow-auto rounded-lg bg-ink-950/80 p-2 text-cream/80">
              {JSON.stringify(toolCall.input, null, 2)}
            </pre>
          </div>
          {toolCall.output !== undefined && (
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-[0.15em] text-cream-faint">
                {t('tool.output')}
              </div>
              <pre className="max-h-48 overflow-auto rounded-lg bg-ink-950/80 p-2 text-cream/80">
                {JSON.stringify(toolCall.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
