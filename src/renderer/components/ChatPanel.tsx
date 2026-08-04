import { useRef, useEffect } from 'react'
import { Cpu, FolderOpen } from 'lucide-react'
import { useAppStore } from '../store'
import { useT } from '../i18n'
import MessageList from './MessageList'
import Composer from './Composer'

export default function ChatPanel() {
  const {
    currentSessionId,
    currentProject,
    sessions,
    messages,
    modules,
    cliAvailable
  } = useAppStore()
  const t = useT()

  const currentSession = sessions.find((s) => s.id === currentSessionId)
  const sessionMessages = currentSessionId ? messages[currentSessionId] || [] : []
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [sessionMessages])

  const handleSend = async (text: string) => {
    if (!currentSessionId || !text.trim() || cliAvailable === false) return
    useAppStore.getState().addMessage(currentSessionId, {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim()
    })
    await window.electronAPI.sendMessage(currentSessionId, text.trim())
  }

  const enabledCount = modules.filter((m) => m.enabled).length

  return (
    <div className="flex h-full flex-col">
      {/* TUI-style status bar, doubles as window drag region */}
      <header className="app-drag flex h-12 shrink-0 items-center gap-3 border-b border-white/[0.07] bg-ink-950/60 px-4 font-mono text-xs backdrop-blur">
        <span className="brand-gradient flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-bold text-ink-950">
          π
        </span>
        <span className="max-w-[200px] truncate text-cream">
          {currentSession ? currentSession.title : t('chat.noActiveSession')}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-cream-faint">
          <FolderOpen size={11} className="shrink-0" />
          <span className="truncate">{currentProject || t('chat.noProject')}</span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-cream-dim">
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_6px_rgba(125,211,252,0.8)]" />
          <Cpu size={12} />
          {t('chat.modulesActive', { count: enabledCount })}
        </span>
      </header>

      <div className="relative flex-1 overflow-y-auto">
        {currentSessionId ? (
          <div className="mx-auto max-w-3xl">
            <MessageList messages={sessionMessages} />
          </div>
        ) : (
          <div className="relative flex h-full flex-col items-center justify-center overflow-hidden px-8 text-center">
            {/* brand glow backdrop */}
            <div className="brand-glow pointer-events-none absolute left-1/2 top-1/2 h-[480px] w-[640px] -translate-x-1/2 -translate-y-1/2" />
            <div className="fade-in relative flex flex-col items-center">
              <div className="brand-gradient mb-6 flex h-16 w-16 items-center justify-center rounded-[22px] text-3xl font-bold text-ink-950 shadow-xl shadow-indigo-500/25">
                π
              </div>
              <h2 className="mb-2.5 text-2xl font-semibold tracking-tight text-cream">
                {t('chat.welcome.title')}
              </h2>
              <p className="max-w-sm text-sm leading-7 text-cream-dim">
                {t('chat.welcome.body')}
              </p>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <Composer onSend={handleSend} disabled={!currentSessionId} />
    </div>
  )
}
