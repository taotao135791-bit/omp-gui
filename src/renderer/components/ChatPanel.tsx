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
      {/* TUI-style status bar */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-white/[0.06] px-4 font-mono text-xs">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-accent/15 font-bold text-[11px] text-accent">
          π
        </span>
        <span className="max-w-[200px] truncate text-cream">
          {currentSession ? currentSession.title : t('chat.noActiveSession')}
        </span>
        <span className="flex min-w-0 items-center gap-1 text-cream-faint">
          <FolderOpen size={11} className="shrink-0" />
          <span className="truncate">{currentProject || t('chat.noProject')}</span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-cream-dim">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          <Cpu size={12} />
          {t('chat.modulesActive', { count: enabledCount })}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto">
        {currentSessionId ? (
          <div className="mx-auto max-w-3xl">
            <MessageList messages={sessionMessages} />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.06] bg-ink-900 text-3xl font-bold text-accent">
              π
            </div>
            <h2 className="mb-2 text-xl font-semibold tracking-tight text-cream">
              {t('chat.welcome.title')}
            </h2>
            <p className="max-w-sm text-sm leading-7 text-cream-dim">
              {t('chat.welcome.body')}
            </p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <Composer onSend={handleSend} disabled={!currentSessionId} />
    </div>
  )
}
