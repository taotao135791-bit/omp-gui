import { useRef, useEffect, useState } from 'react'
import { FolderOpen, Compass, Hammer, GitPullRequest, Bug } from 'lucide-react'
import { SlashCommand } from '@shared/types'
import { useAppStore } from '../store'
import { useT, I18nKey } from '../i18n'
import { createSessionForCurrentProject } from '../lib/session'
import MessageList from './MessageList'
import Composer from './Composer'
import ExtensionUiDialog from './ExtensionUiDialog'
import UsageMonitor from './UsageMonitor'
import Logo from './Logo'

interface Suggestion {
  icon: typeof Compass
  iconClass: string
  chipClass: string
  labelKey: I18nKey
  promptKey: I18nKey
}

const SUGGESTIONS: Suggestion[] = [
  {
    icon: Compass,
    iconClass: 'text-sky-600 dark:text-sky-400',
    chipClass: 'bg-sky-500/10',
    labelKey: 'chat.suggest.explore',
    promptKey: 'chat.suggest.explore.prompt'
  },
  {
    icon: Hammer,
    iconClass: 'text-violet-600 dark:text-violet-400',
    chipClass: 'bg-violet-500/10',
    labelKey: 'chat.suggest.build',
    promptKey: 'chat.suggest.build.prompt'
  },
  {
    icon: GitPullRequest,
    iconClass: 'text-emerald-600 dark:text-emerald-400',
    chipClass: 'bg-emerald-500/10',
    labelKey: 'chat.suggest.review',
    promptKey: 'chat.suggest.review.prompt'
  },
  {
    icon: Bug,
    iconClass: 'text-orange-600 dark:text-orange-400',
    chipClass: 'bg-orange-500/10',
    labelKey: 'chat.suggest.fix',
    promptKey: 'chat.suggest.fix.prompt'
  }
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
    uiRequests,
    setCurrentProject
  } = useAppStore()
  const t = useT()

  const currentSession = sessions.find((s) => s.id === currentSessionId)
  const sessionMessages = currentSessionId ? messages[currentSessionId] || [] : []
  const isBusy = currentSessionId ? Boolean(busy[currentSessionId]) : false
  const isCompacting = useAppStore((s) =>
    currentSessionId ? Boolean(s.compacting[currentSessionId]) : false
  )
  const pendingUi = currentSessionId ? (uiRequests[currentSessionId] || [])[0] : undefined
  const bottomRef = useRef<HTMLDivElement>(null)
  const [slashCommands, setSlashCommands] = useState<SlashCommand[]>([])

  // Slash commands come from the live session (extensions/prompts/skills)
  useEffect(() => {
    if (!currentSessionId) {
      setSlashCommands([])
      return
    }
    let cancelled = false
    window.electronAPI.listCommands(currentSessionId).then((cmds) => {
      if (!cancelled) setSlashCommands(cmds)
    })
    return () => {
      cancelled = true
    }
  }, [currentSessionId])

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

  const handleCompact = async () => {
    const sid = currentSessionId
    if (!sid) return
    const store = useAppStore.getState()
    store.setCompacting(sid, true)
    await window.electronAPI.compactSession(sid)
    useAppStore.getState().setCompacting(sid, false)
    const stats = await window.electronAPI.getSessionStats(sid)
    if (stats) useAppStore.getState().setStats(sid, stats)
  }

  const handleSelectProject = async () => {
    const folder = await window.electronAPI.selectFolder()
    if (folder) {
      setCurrentProject(folder)
      window.electronAPI.setFsRoot(folder)
    }
  }

  const projectName = currentProject ? currentProject.split('/').filter(Boolean).pop() : null
  const enabledCount = packages.filter((p) => p.enabled).length
  const showHero = sessionMessages.length === 0
  const showThinking =
    isBusy && sessionMessages.length > 0 && sessionMessages[sessionMessages.length - 1].role === 'user'

  return (
    <div className="relative flex h-full flex-col">
      {/* status bar, doubles as window drag region */}
      <header className="app-drag flex h-12 shrink-0 items-center gap-2.5 border-b border-line px-4 text-xs">
        <span className="max-w-[240px] truncate text-[13px] font-medium tracking-tight text-cream">
          {currentSession ? currentSession.title : t('chat.noActiveSession')}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 rounded-full border border-line bg-overlay px-2 py-[3px] text-cream-dim">
          <FolderOpen size={11} className="shrink-0" />
          <span className="truncate font-mono text-[11px]">
            {projectName || t('chat.noProject')}
          </span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2.5 text-cream-dim">
          {isCompacting && (
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              <span className="font-medium text-accent">{t('chat.compacting')}</span>
            </span>
          )}
          {isBusy ? (
            <>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              <span className="font-medium text-accent">{t('chat.working')}</span>
            </>
          ) : (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/80" />
              {t('chat.modulesActive', { count: enabledCount })}
            </>
          )}
        </span>
      </header>

      <div className="relative min-h-0 flex-1">
        <div className="relative h-full overflow-y-auto">
        {showHero ? (
          <div className="flex h-full flex-col items-center justify-center px-8 pb-10">
            <div className="flex w-full max-w-2xl flex-col items-center">
              <div className="rise" style={{ animationDelay: '0ms' }}>
                <Logo size={52} />
              </div>
              <h2
                className="rise mb-9 mt-5 font-serif text-[30px] font-medium tracking-tight text-cream"
                style={{ animationDelay: '60ms' }}
              >
                {t('chat.hero.title')}
              </h2>
              <div className="grid w-full grid-cols-2 gap-3 lg:grid-cols-4">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={s.labelKey}
                    onClick={() => handleSend(t(s.promptKey))}
                    disabled={cliAvailable === false}
                    style={{ animationDelay: `${120 + i * 70}ms` }}
                    className="rise group flex min-h-[104px] flex-col items-start gap-3 rounded-xl border border-line bg-ink-850 p-3.5 text-left shadow-card transition-all duration-200 ease-standard hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
                  >
                    <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${s.chipClass}`}>
                      <s.icon size={15} className={s.iconClass} strokeWidth={1.8} />
                    </span>
                    <span className="text-[13px] font-medium leading-5 text-cream-dim transition-colors group-hover:text-cream">
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
                <Logo size={22} className="shrink-0" />
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
        {currentSessionId && (
          <div className="absolute bottom-3 right-4 z-10">
            <UsageMonitor sessionId={currentSessionId} />
          </div>
        )}
      </div>

      {!currentProject && (
        <div className="flex justify-center pb-1">
          <button
            onClick={handleSelectProject}
            className="flex items-center gap-2 rounded-full border border-line bg-ink-850 px-3.5 py-1.5 text-xs text-cream-dim shadow-card transition-all duration-200 ease-standard hover:-translate-y-px hover:border-line-strong hover:text-cream"
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
        commands={slashCommands}
        onCompact={currentSessionId ? handleCompact : undefined}
      />

      {pendingUi && currentSessionId && (
        <ExtensionUiDialog sessionId={currentSessionId} request={pendingUi} />
      )}
    </div>
  )
}
