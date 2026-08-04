import { useState } from 'react'
import { ChevronDown, ChevronRight, Terminal } from 'lucide-react'

interface ToolCallCardProps {
  toolCall: {
    tool: string
    input: unknown
    output?: unknown
  }
}

export default function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="w-full min-w-[240px]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 text-left text-xs font-medium text-gray-300"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Terminal size={14} />
        <span className="font-mono">{toolCall.tool}</span>
      </button>
      {expanded && (
        <div className="mt-2 space-y-2 font-mono text-xs">
          <div className="rounded-md bg-surface-900/50 p-2">
            <div className="mb-1 text-gray-500">Input</div>
            <pre className="overflow-auto text-gray-300">
              {JSON.stringify(toolCall.input, null, 2)}
            </pre>
          </div>
          {toolCall.output !== undefined && (
            <div className="rounded-md bg-surface-900/50 p-2">
              <div className="mb-1 text-gray-500">Output</div>
              <pre className="overflow-auto text-gray-300">
                {JSON.stringify(toolCall.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
