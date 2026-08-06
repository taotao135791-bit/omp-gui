import { useState } from 'react'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { useT } from '../i18n'

interface ToolCallCardProps {
  toolCall: {
    tool: string
    input: unknown
    output?: unknown
    isError?: boolean
  }
}

/** One-line summary of a tool call's input, shown in the collapsed header. */
function summarizeInput(tool: string, input: unknown): string | null {
  if (input === undefined || input === null) return null
  const name = tool.toLowerCase()
  if (typeof input === 'object') {
    const obj = input as Record<string, unknown>
    if (name === 'bash' && typeof obj.command === 'string') {
      return obj.command.split('\n', 1)[0]
    }
    if ((name === 'read' || name === 'edit' || name === 'write') && typeof obj.path === 'string') {
      return obj.path
    }
  }
  try {
    return JSON.stringify(input)?.slice(0, 40) ?? null
  } catch {
    return null
  }
}

export default function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false)
  const t = useT()
  const summary = summarizeInput(toolCall.tool, toolCall.input)
  const running = toolCall.output === undefined

  // Borderless one-line row; the surrounding group container (MessageList)
  // draws the box and hairline separators between consecutive tool calls.
  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex h-8 w-full items-center gap-2.5 px-3 text-left transition-colors hover:bg-overlay"
      >
        {running ? (
          <Loader2 size={11} className="shrink-0 animate-spin text-amber-500" />
        ) : (
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              toolCall.isError ? 'bg-red-500' : 'bg-emerald-500'
            }`}
          />
        )}
        <span className="shrink-0 text-[13px] font-medium text-cream">{toolCall.tool}</span>
        {summary && (
          <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-cream-faint">
            {summary}
          </span>
        )}
        <span className="ml-auto shrink-0 text-cream-faint">
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
      </button>
      {expanded && (
        <div className="fade-in mb-2.5 ml-[14px] mr-3 space-y-2.5 border-l-2 border-line py-0.5 pl-3">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-cream-faint">
              {t('tool.input')}
            </div>
            <pre className="max-h-48 overflow-auto rounded-lg bg-ink-800 p-3 font-mono text-[12px] leading-5 text-cream/80">
              {JSON.stringify(toolCall.input, null, 2)}
            </pre>
          </div>
          {toolCall.output !== undefined && (
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-cream-faint">
                {t('tool.output')}
              </div>
              <pre className="max-h-48 overflow-auto rounded-lg bg-ink-800 p-3 font-mono text-[12px] leading-5 text-cream/80">
                {JSON.stringify(toolCall.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
