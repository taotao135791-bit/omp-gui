import { useState, useRef, KeyboardEvent } from 'react'
import { ArrowUp, Square, Paperclip, Image } from 'lucide-react'
import { useT } from '../i18n'
import ModelPicker from './ModelPicker'

interface ComposerProps {
  onSend: (text: string) => void
  onStop?: () => void
  busy?: boolean
  disabled?: boolean
}

export default function Composer({ onSend, onStop, busy, disabled }: ComposerProps) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const t = useT()

  const handleSend = () => {
    if (!text.trim() || disabled || busy) return
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
    <div className="p-4 pt-2">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-xl border border-line bg-ink-850 p-2 shadow-[0_2px_12px_rgba(0,0,0,0.05)] transition focus-within:border-ink-600 dark:shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            disabled={disabled}
            placeholder={disabled ? t('composer.placeholderDisabled') : t('composer.placeholder')}
            rows={1}
            className="max-h-40 w-full resize-none bg-transparent px-2.5 py-1.5 text-[15px] leading-6 text-cream placeholder-cream-faint outline-none"
          />
          <div className="flex items-center justify-between px-1 pb-0.5 pt-0.5">
            <div className="flex items-center gap-0.5">
              <button className="rounded-md p-1.5 text-cream-faint transition hover:bg-overlay hover:text-cream">
                <Paperclip size={14} />
              </button>
              <button className="rounded-md p-1.5 text-cream-faint transition hover:bg-overlay hover:text-cream">
                <Image size={14} />
              </button>
              <ModelPicker />
            </div>
            {busy ? (
              <button
                onClick={onStop}
                title={t('composer.stop')}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-cream text-ink-950 transition hover:opacity-85 active:scale-95"
              >
                <Square size={11} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={disabled || !text.trim()}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-cream text-ink-950 transition hover:opacity-85 active:scale-95 disabled:cursor-not-allowed disabled:opacity-25"
              >
                <ArrowUp size={15} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
        <div className="mt-1.5 text-center text-[10.5px] text-cream-faint">
          {t('composer.disclaimer')}
        </div>
      </div>
    </div>
  )
}
