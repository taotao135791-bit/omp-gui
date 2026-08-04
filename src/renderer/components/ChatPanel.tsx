import { useRef, useEffect } from 'react'
import { Cpu, FolderOpen, Compass, Hammer, GitPullRequest, Bug } from 'lucide-react'
import { useAppStore } from '../store'
import { useT, I18nKey } from '../i18n'
import MessageList from './MessageList'
import Composer from './Composer'

interface Suggestion {
  icon: typeof Compass
  iconClass: string
  labelKey: I18nKey
  promptKey: I18nKey
}

const SUGGESTIONS: Suggestion[] = [
  { icon: Compass, iconClass: 'text-sky-500', labelKey: 'chat.suggest.explore', promptKey: 'chat.suggest.explore.prompt' },
  { icon: Hammer, iconClass: 'text-violet-500', labelKey: 'chat.suggest.build', promptKey: 'chat.suggest.build.prompt' },
  { icon: GitPullRequest, iconClass: 'text-emerald-500', labelKey: 'chat.suggest.review', promptKey: 'chat.suggest.review.prompt' },
  { icon: Bug, iconClass: 'text-orange-500', labelKey: 'chat.suggest.fix', promptKey: 'chat.suggest.fix.prompt' }
]

export default function ChatPanel() {
  const {
    currentSessionId,
    currentProject,
    sessions,
    messages,
    modules,
    cliAvailable,
    setCurrentProject,
    addSession
  } = useAppStore()
  const t = useT()

  const currentSession = sessions.find((s) => s.id === currentSessionId)
  const sessionMessages = currentSessionId ? messages[currentSessionId] || [] : []
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [sessionMessages])

  const ensureSession = async (): Promise<string | null> => {
    if (currentSessionId) return currentSessionId
    let project = currentProject
    if (!project) {
      project = await window.electronAPI.selectFolder()
      if (!project) return null
      setCurrentProject(project)
      window.electronAPI.setFsRoot(project)
    }
    const session = await window.electronAPI.createSession(project)
    addSession(session)
    return session.id
  }

  const handleSend = async (text: string) => {
    if (!text.trim() || cliAvailable === false) return
    const sessionId = await ensureSession()
    if (!sessionId) return
    useAppStore.getState().addMessage(sessionId, {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim()
    })
    await window.electronAPI.sendMessage(sessionId, text.trim())
  }

  const handleSelectProject = async () => {
    const folder = await window.electronAPI.selectFolder()
    if (folder) {
      setCurrentProject(folder)
      window.electronAPI.setFsRoot(folder)
    }
  }

  const enabledCount = modules.filter((m) => m.enabled).length
  const showHero = sessionMessages.length === 0

  return (
    <div className="flex h-full flex-col">
      {/* status bar, doubles as window drag region */}
      <header className="app-drag flex h-12 shrink-0 items-center gap-3 border-b border-line px-4 text-xs">
        <span className="brand-gradient flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-bold text-white">
          π
        </span>
        <span className="max-w-[200px] truncate font-medium text-cream">
          {currentSession ? currentSession.title : t('chat.noActiveSession')}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-cream-faint">
          <FolderOpen size={11} className="shrink-0" />
          <span className="truncate">{currentProject || t('chat.noProject')}</span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-cream-dim">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          <Cpu size={12} />
          {t('chat.modulesActive', { count: enabledCount })}
        </span>
      </header>

      <div className="relative flex-1 overflow-y-auto">
        {showHero ? (
          <div className="flex h-full flex-col items-center justify-center px-8">
            <div className="fade-in flex w-full max-w-2xl flex-col items-center">
              <div className="brand-gradient mb-6 flex h-14 w-14 items-center justify-center rounded-[18px] text-2xl font-bold text-white shadow-lg shadow-indigo-500/20">
                π
              </div>
              <h2 className="mb-8 text-[26px] font-semibold tracking-tight text-cream">
                {t('chat.hero.title')}
              </h2>
              <div className="grid w-full grid-cols-2 gap-3 lg:grid-cols-4">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.labelKey}
                    onClick={() => handleSend(t(s.promptKey))}
                    disabled={cliAvailable === false}
                    className="flex min-h-[104px] flex-col items-start gap-3 rounded-2xl border border-line bg-ink-850 p-4 text-left shadow-sm transition hover:border-ink-600 hover:shadow disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <s.icon size={18} className={s.iconClass} />
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
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {!currentProject && (
        <div className="flex justify-center pb-1">
          <button
            onClick={handleSelectProject}
            className="flex items-center gap-2 rounded-full border border-line bg-ink-850 px-4 py-1.5 text-xs text-cream-dim shadow-sm transition hover:border-ink-600 hover:text-cream"
          >
            <FolderOpen size={12} />
            {t('chat.selectProject')}
          </button>
        </div>
      )}

      <Composer onSend={handleSend} disabled={cliAvailable === false} />
    </div>
  )
}
