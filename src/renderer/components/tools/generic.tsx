import { useT } from '../../i18n'
import { ToolContentProps } from './index'

/** Fallback renderer: the raw input/output JSON, for tools without a custom view. */
export default function GenericToolContent({ toolCall }: ToolContentProps) {
  const t = useT()
  return (
    <div className="space-y-2.5">
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
  )
}
