import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { headTailLines, formatHiddenLines } from '../../lib/retention'
import { useT } from '../../i18n'

const HEAD_LINES = 100
const TAIL_LINES = 30
/** Above this many lines, the output is retained (head/tail) instead of full-DOM. */
const LINE_THRESHOLD = 200

interface RetainedOutputProps {
  text: string
  /** Monospace container classes for the <pre> body. */
  className?: string
}

/**
 * Large-output presentation: small outputs render in full; large ones render
 * head + hidden-count + tail by default, with a keyboard-reachable expand/collapse
 * to the full text. This bounds the DOM — a 4 MB tool output never materializes
 * as tens of thousands of nodes unless the user explicitly opens it.
 */
export default function RetainedOutput({ text, className = '' }: RetainedOutputProps) {
  const [expanded, setExpanded] = useState(false)
  const t = useT()
  const lineCount = text ? text.replace(/\n$/, '').split('\n').length : 0
  const isLarge = lineCount > LINE_THRESHOLD

  if (!isLarge) {
    return <pre className={className}>{text}</pre>
  }

  const retained = headTailLines(text, HEAD_LINES, TAIL_LINES)

  return (
    <div>
      {expanded ? (
        <pre className={className}>{text}</pre>
      ) : (
        <pre className={className}>
          {retained.head}
          {'\n'}
          <span className="select-none text-cream-faint">{formatHiddenLines(retained.hidden)}</span>
          {'\n'}
          {retained.tail}
        </pre>
      )}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="mt-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-cream-faint transition-colors hover:bg-overlay hover:text-cream"
        aria-expanded={expanded}
      >
        {expanded ? (
          <>
            <ChevronUp size={12} /> {t('tool.collapse')}
          </>
        ) : (
          <>
            <ChevronDown size={12} /> {t('tool.showFullOutput', { lines: lineCount })}
          </>
        )}
      </button>
    </div>
  )
}
