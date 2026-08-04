import { useState, useRef, KeyboardEvent } from 'react'
import { ArrowUp, Paperclip, Image } from 'lucide-react'
import { useT } from '../i18n'

interface ComposerProps {
  onSend: (text: string) => void
  disabled?: boolean
}

export default function Composer({ onSend, disabled }: ComposerProps) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const t = useT()

  const handleSend = () => {
    if (!text.trim() || disabled) return
    onSend(text)
    setText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  return (
    <div className="border-t border-white/[0.06] bg-ink-950/80 p-4">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-white/[0.08] bg-ink-900 p-2 transition focus-within:border-accent/40">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            disabled={disabled}
            placeholder={disabled ? t('composer.placeholderDisabled') : t('composer.placeholder')}
            rows={1}
            className="max-h-40 w-full resize-none bg-transparent px-2.5 py-2 text-sm leading-6 text-cream placeholder-cream-faint outline-none"
          />
          <div className="flex items-center justify-between px-1.5 pb-0.5 pt-1">
            <div className="flex items-center gap-0.5">
              <button className="rounded-lg p-1.5 text-cream-faint transition hover:bg-white/[0.06] hover:text-cream">
                <Paperclip size={15} />
              </button>
              <button className="rounded-lg p-1.5 text-cream-faint transition hover:bg-white/[0.06] hover:text-cream">
                <Image size={15} />
              </button>
            </div>
            <button
              onClick={handleSend}
              disabled={disabled || !text.trim()}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-cream text-ink-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
        <div className="mt-2 text-center text-[11px] text-cream-faint">
          {t('composer.disclaimer')}
        </div>
      </div>
    </div>
  )
}
