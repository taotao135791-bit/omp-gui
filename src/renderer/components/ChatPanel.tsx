import { useRef, useEffect } from 'react'
import { FolderOpen, Compass, Hammer, GitPullRequest, Bug, Cpu } from 'lucide-react'
import { useAppStore } from '../store'
import { useT, I18nKey } from '../i18n'
import { createSessionForCurrentProject } from '../lib/session'
import MessageList from './MessageList'
import Composer from './Composer'

interface Suggestion {
  icon: typeof Compass
  iconClass: string
  labelKey: I18nKey
  promptKey: I18nKey
}

const SUGGESTIONS: Suggestion[] = [
  { icon: Compass, iconClass: 'text-sky-600 dark:text-sky-400', labelKey: 'chat.suggest.explore', promptKey: 'chat.suggest.explore.prompt' },
  { icon: Hammer, iconClass: 'text-violet-600 dark:text-violet-400', labelKey: 'chat.suggest.build', promptKey: 'chat.suggest.build.prompt' },
  { icon: GitPullRequest, iconClass: 'text-emerald-600 dark:text-emerald-400', labelKey: 'chat.suggest.review', promptKey: 'chat.suggest.review.prompt' },
  { icon: Bug, iconClass: 'text-orange-600 dark:text-orange-400', labelKey: 'chat.suggest.fix', promptKey: 'chat.suggest.fix.prompt' }
]

export default function ChatPanel() {
  const {
    currentSessionId,
    currentProject,
    sessions,
    messages,
    packages,
    cliAvailable,
    busy,
    setCurrentProject
  } = useAppStore()
  const t = useT()

  const currentSession = sessions.find((s) => s.id === currentSessionId)
  const sessionMessages = currentSessionId ? messages[currentSessionId] || [] : []
  const isBusy = currentSessionId ? Boolean(busy[currentSessionId]) : false
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [sessionMessages, isBusy])

  const handleSend = async (text: string) => {
    if (!text.trim() || cliAvailable === false) return
    const sessionId = currentSessionId ?? (await createSessionForCurrentProject())
    if (!sessionId) return
    useAppStore.getState().addMessage(sessionId, {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim()
    })
    // Optimistic: show the working state until agent_end / error lands
    useAppStore.getState().setBusy(sessionId, true)
    await window.electronAPI.sendMessage(sessionId, text.trim())
  }

  const handleStop = async () => {
    if (currentSessionId) {
      await window.electronAPI.abortSession(currentSessionId)
    }
  }

  const handleSelectProject = async () => {
    const folder = await window.electronAPI.selectFolder()
    if (folder) {
      setCurrentProject(folder)
      window.electronAPI.setFsRoot(folder)
    }
  }

  const enabledCount = packages.filter((p) => p.enabled).length
  const showHero = sessionMessages.length === 0
  const showThinking =
    isBusy && sessionMessages.length > 0 && sessionMessages[sessionMessages.length - 1].role === 'user'

  return (
    <div className="flex h-full flex-col">
      {/* status bar, doubles as window drag region */}
      <header className="app-drag flex h-12 shrink-0 items-center gap-2.5 border-b border-line px-4 text-xs">
        <span className="brand-mark flex h-[18px] w-[18px] items-center justify-center rounded text-[10px] font-bold">
          π
        </span>
        <span className="max-w-[200px] truncate text-[13px] font-medium text-cream">
          {currentSession ? currentSession.title : t('chat.noActiveSession')}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-cream-faint">
          <FolderOpen size={11} className="shrink-0" />
          <span className="truncate font-mono text-[11px]">{currentProject || t('chat.noProject')}</span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-cream-dim">
          {isBusy ? (
            <>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              <span className="text-accent">{t('chat.working')}</span>
            </>
          ) : (
            <>
              <Cpu size={12} />
              {t('chat.modulesActive', { count: enabledCount })}
            </>
          )}
        </span>
      </header>

      <div className="relative flex-1 overflow-y-auto">
        {showHero ? (
          <div className="flex h-full flex-col items-center justify-center px-8">
            <div className="fade-in flex w-full max-w-2xl flex-col items-center">
              <div className="brand-mark mb-6 flex h-12 w-12 items-center justify-center rounded-xl text-xl font-bold">
                π
              </div>
              <h2 className="mb-8 font-serif text-[27px] font-medium tracking-tight text-cream">
                {t('chat.hero.title')}
              </h2>
              <div className="grid w-full grid-cols-2 gap-2.5 lg:grid-cols-4">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.labelKey}
                    onClick={() => handleSend(t(s.promptKey))}
                    disabled={cliAvailable === false}
                    className="flex min-h-[96px] flex-col items-start gap-2.5 rounded-lg border border-line bg-ink-850 p-3.5 text-left transition hover:border-ink-600 hover:shadow-[0_2px_8px_rgba(0,0,0,0.05)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <s.icon size={16} className={s.iconClass} strokeWidth={1.8} />
                    <span className="text-[13px] font-medium leading-5 text-cream">
                      {t(s.labelKey)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl">
            <MessageList messages={sessionMessages} />
            {showThinking && (
              <div className="msg-in flex items-center gap-3 px-4 pb-6">
                <div className="brand-mark flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold">
                  π
                </div>
                <div className="flex items-center gap-1">
                  <span className="think-dot h-1.5 w-1.5 rounded-full bg-cream-dim" />
                  <span className="think-dot h-1.5 w-1.5 rounded-full bg-cream-dim" />
                  <span className="think-dot h-1.5 w-1.5 rounded-full bg-cream-dim" />
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {!currentProject && (
        <div className="flex justify-center pb-1">
          <button
            onClick={handleSelectProject}
            className="flex items-center gap-2 rounded-full border border-line bg-ink-850 px-3.5 py-1.5 text-xs text-cream-dim transition hover:border-ink-600 hover:text-cream"
          >
            <FolderOpen size={12} />
            {t('chat.selectProject')}
          </button>
        </div>
      )}

      <Composer
        onSend={handleSend}
        onStop={handleStop}
        busy={isBusy}
        disabled={cliAvailable === false}
      />
    </div>
  )
}
