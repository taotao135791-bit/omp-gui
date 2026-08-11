import { ReactElement, ReactNode, isValidElement, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import mermaid from 'mermaid'
import { Check, Copy, Code2, Eye } from 'lucide-react'
import { useT } from '../i18n'
import { useAppStore } from '../store'

interface CodeChildProps {
  className?: string
  children?: ReactNode
}

let mermaidSeq = 0

/**
 * ```mermaid blocks rendered as SVG diagrams, with a code/diagram toggle and
 * a graceful fallback to the raw source when the syntax doesn't parse.
 */
function MermaidBlock({ raw, theme }: { raw: string; theme: string }) {
  const t = useT()
  const [svg, setSvg] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [showCode, setShowCode] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSvg(null)
    setFailed(false)
    mermaid.initialize({
      startOnLoad: false,
      theme: theme === 'dark' ? 'dark' : 'neutral',
      securityLevel: 'strict',
      fontFamily: 'inherit'
    })
    const id = `omp-mmd-${++mermaidSeq}`
    const cleanup = () => {
      // mermaid.render sandboxes into <div id="d{id}"> and leaks it on errors
      document.getElementById(id)?.remove()
      document.getElementById(`d${id}`)?.remove()
    }
    mermaid
      .render(id, raw)
      .then(({ svg }) => {
        if (!cancelled) setSvg(svg)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
      .finally(cleanup)
    return () => {
      cancelled = true
      cleanup()
    }
  }, [raw, theme])

  if (failed) {
    // Unparseable — show the source like any other code block, with a note
    return (
      <div>
        <pre className="overflow-x-auto rounded-lg border border-line bg-ink-800 p-3.5 font-mono text-[13px] leading-6 text-cream/90">
          <code>{raw}</code>
        </pre>
        <div className="mt-1 text-[11px] text-cream-faint">{t('mermaid.failed')}</div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-ink-800">
      <div className="flex items-center justify-between border-b border-line bg-overlay px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-cream-faint">
          mermaid
        </span>
        <button
          onClick={() => setShowCode((v) => !v)}
          title={showCode ? t('mermaid.showDiagram') : t('mermaid.showCode')}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-cream-faint transition hover:bg-overlay-strong hover:text-cream"
        >
          {showCode ? <Eye size={11} /> : <Code2 size={11} />}
          {showCode ? t('mermaid.showDiagram') : t('mermaid.showCode')}
        </button>
      </div>
      {showCode || !svg ? (
        <pre className="overflow-x-auto p-3.5 font-mono text-[13px] leading-6 text-cream/90">
          <code>{raw}</code>
        </pre>
      ) : (
        <div
          className="mermaid-diagram overflow-x-auto p-3.5 [&_svg]:mx-auto [&_svg]:max-w-full"
          // mermaid.render returns sanitized SVG under securityLevel 'strict'
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
    </div>
  )
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false)
  const t = useT()

  let lang = ''
  let raw = ''
  if (isValidElement<CodeChildProps>(children)) {
    const child = children as ReactElement<CodeChildProps>
    lang = /language-(\w+)/.exec(child.props.className || '')?.[1] || ''
    raw = String(child.props.children ?? '').replace(/\n$/, '')
  }

  const copy = () => {
    navigator.clipboard.writeText(raw)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-ink-800">
      <div className="flex items-center justify-between border-b border-line bg-overlay px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-cream-faint">
          {lang || 'code'}
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-cream-faint transition hover:bg-overlay-strong hover:text-cream"
        >
          {copied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
          {copied ? t('code.copied') : t('code.copy')}
        </button>
      </div>
      <pre className="overflow-x-auto p-3.5 font-mono text-[13px] leading-6 text-cream/90">
        <code>{raw}</code>
      </pre>
    </div>
  )
}

export default function Markdown({ content }: { content: string }) {
  const theme = useAppStore((s) => s.theme)
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => {
            let lang = ''
            let raw = ''
            if (isValidElement<CodeChildProps>(children)) {
              const child = children as ReactElement<CodeChildProps>
              lang = /language-(\w+)/.exec(child.props.className || '')?.[1] || ''
              raw = String(child.props.children ?? '').replace(/\n$/, '')
            }
            if (lang === 'mermaid' && raw.trim()) {
              return <MermaidBlock raw={raw} theme={theme} />
            }
            return <CodeBlock>{children}</CodeBlock>
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
