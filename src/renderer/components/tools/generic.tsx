import { useT } from '../../i18n'
import RetainedOutput from './RetainedOutput'
import { ToolContentProps, toolOutputText } from './index'

/** Fallback renderer: the raw input/output JSON, for tools without a custom view. */
export default function GenericToolContent({ toolCall }: ToolContentProps) {
  const t = useT()
  const output = toolOutputText(toolCall.output)
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
      {output !== null && (
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-cream-faint">
            {t('tool.output')}
          </div>
          <RetainedOutput
            text={output}
            className="max-h-48 overflow-auto rounded-lg bg-ink-800 p-3 font-mono text-[12px] leading-5 text-cream/80"
          />
        </div>
      )}
    </div>
  )
}
