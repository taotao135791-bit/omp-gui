import { useState, useRef, useMemo, KeyboardEvent } from 'react'
import { ArrowUp, Square, Paperclip, Image, Zap } from 'lucide-react'
import { SlashCommand } from '@shared/types'
import { useT } from '../i18n'
import ModelPicker from './ModelPicker'

interface ComposerProps {
  onSend: (text: string) => void
  onStop?: () => void
  busy?: boolean
  disabled?: boolean
  /** Slash commands available in the live session (from get_commands). */
  commands?: SlashCommand[]
  /** Built-in /compact action, shown first in the slash menu. */
  onCompact?: () => void
}

type MenuItem = SlashCommand & { builtin?: boolean }

export default function Composer({
  onSend,
  onStop,
  busy,
  disabled,
  commands = [],
  onCompact
}: ComposerProps) {
  const [text, setText] = useState('')
  const [menuIndex, setMenuIndex] = useState(0)
  const [menuDismissed, setMenuDismissed] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const t = useT()

  // Slash menu is active while the whole input is a single "/partial" token
  const slashQuery = /^\/(\S*)$/.test(text) && !menuDismissed ? text.slice(1).toLowerCase() : null
  const menuItems = useMemo<MenuItem[]>(() => {
    if (slashQuery === null) return []
    const all: MenuItem[] = [
      ...(onCompact
        ? [{ name: 'compact', description: t('composer.slashCompact'), source: 'prompt' as const, builtin: true }]
        : []),
      ...commands
    ]
    return all.filter((c) => c.name.toLowerCase().startsWith(slashQuery)).slice(0, 8)
  }, [slashQuery, commands, onCompact, t])
  const menuOpen = menuItems.length > 0

  const pickCommand = (item: MenuItem) => {
    if (item.builtin) {
      setText('')
      onCompact?.()
      return
    }
    setText(`/${item.name} `)
    setMenuDismissed(false)
    setMenuIndex(0)
    textareaRef.current?.focus()
  }

  const handleSend = () => {
    if (!text.trim() || disabled || busy) return
    onSend(text)
    setText('')
    setMenuDismissed(false)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMenuIndex((i) => (i + 1) % menuItems.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMenuIndex((i) => (i - 1 + menuItems.length) % menuItems.length)
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing)) {
        e.preventDefault()
        pickCommand(menuItems[Math.min(menuIndex, menuItems.length - 1)])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMenuDismissed(true)
        return
      }
    }
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

  const canSend = !disabled && !busy && Boolean(text.trim())

  return (
    <div className="px-4 pb-4 pt-2">
      <div className="relative mx-auto max-w-3xl">
        {menuOpen && (
          <div className="absolute bottom-full left-0 right-0 z-20 mb-2 overflow-hidden rounded-xl border border-line bg-ink-900 p-1 shadow-pop">
            <div className="px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.08em] text-cream-faint">
              {t('composer.slashTitle')}
            </div>
            {menuItems.map((item, i) => (
              <button
                key={`${item.source}-${item.name}`}
                onMouseEnter={() => setMenuIndex(i)}
                onClick={() => pickCommand(item)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                  i === menuIndex ? 'bg-overlay-strong' : ''
                }`}
              >
                <Zap size={12} className={item.builtin ? 'shrink-0 text-accent' : 'shrink-0 text-cream-faint'} />
                <span className="shrink-0 whitespace-nowrap font-mono text-[12px] text-cream">
                  /{item.name}
                </span>
                {item.description && (
                  <span className="min-w-0 truncate text-[11px] text-cream-faint">
                    {item.description}
                  </span>
                )}
                <span className="ml-auto shrink-0 font-mono text-[9.5px] uppercase tracking-wider text-cream-faint">
                  {item.builtin ? t('composer.slashBuiltin') : item.source}
                </span>
              </button>
            ))}
          </div>
        )}
        <div
          className={`rounded-2xl border bg-ink-850 p-2 shadow-card transition-all duration-200 ease-standard focus-within:shadow-pop ${
            disabled ? 'border-line' : 'border-line focus-within:border-accent/50'
          }`}
        >
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setMenuDismissed(false)
              setMenuIndex(0)
            }}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            disabled={disabled}
            placeholder={disabled ? t('composer.placeholderDisabled') : t('composer.placeholder')}
            rows={1}
            className="max-h-40 w-full resize-none bg-transparent px-2.5 py-1.5 text-[15px] leading-6 text-cream placeholder-cream-faint outline-none"
          />
          <div className="flex items-center justify-between px-1 pb-0.5 pt-0.5">
            <div className="flex items-center gap-0.5">
              <button
                title={t('composer.attach')}
                className="focus-ring rounded-lg p-1.5 text-cream-faint transition-colors hover:bg-overlay hover:text-cream"
              >
                <Paperclip size={14} />
              </button>
              <button
                title={t('composer.attachImage')}
                className="focus-ring rounded-lg p-1.5 text-cream-faint transition-colors hover:bg-overlay hover:text-cream"
              >
                <Image size={14} />
              </button>
              <ModelPicker />
            </div>
            {busy ? (
              <button
                onClick={onStop}
                title={t('composer.stop')}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-cream text-ink-950 shadow-card transition-all duration-150 hover:opacity-85 active:scale-95"
              >
                <Square size={11} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!canSend}
                title={t('composer.send')}
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-all duration-150 active:scale-95 ${
                  canSend
                    ? 'bg-accent text-white shadow-card hover:bg-accent-bright'
                    : 'cursor-not-allowed bg-overlay-strong text-cream-faint'
                }`}
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
