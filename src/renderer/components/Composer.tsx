import { useState, useRef, KeyboardEvent } from 'react'
import { Send, Paperclip, Image } from 'lucide-react'

interface ComposerProps {
  onSend: (text: string) => void
  disabled?: boolean
}

export default function Composer({ onSend, disabled }: ComposerProps) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = () => {
    if (!text.trim() || disabled) return
    onSend(text)
    setText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
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
    <div className="border-t border-surface-700 bg-surface-800/50 p-4">
      <div className="relative rounded-xl border border-surface-600 bg-surface-800 p-2 shadow-sm focus-within:border-brand">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          disabled={disabled}
          placeholder={disabled ? 'Select a session to start chatting...' : 'Ask anything...'}
          rows={1}
          className="max-h-40 w-full resize-none bg-transparent px-2 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none"
        />
        <div className="flex items-center justify-between px-2 pb-1 pt-1">
          <div className="flex items-center gap-1">
            <button className="rounded p-1.5 text-gray-500 hover:bg-surface-700 hover:text-gray-300">
              <Paperclip size={16} />
            </button>
            <button className="rounded p-1.5 text-gray-500 hover:bg-surface-700 hover:text-gray-300">
              <Image size={16} />
            </button>
          </div>
          <button
            onClick={handleSend}
            disabled={disabled || !text.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={14} />
            Send
          </button>
        </div>
      </div>
      <div className="mt-2 text-center text-xs text-gray-600">
        Oh My Pi can make mistakes. Review important code before running it.
      </div>
    </div>
  )
}
