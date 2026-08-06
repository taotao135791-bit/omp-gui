import { useRef, useEffect, useState } from 'react'
import { FolderOpen, Compass, Hammer, GitPullRequest, Bug, Download, Loader2 } from 'lucide-react'
import { PromptImage, SlashCommand } from '@shared/types'
import { useAppStore } from '../store'
import { useT, I18nKey } from '../i18n'
import { createSessionForCurrentProject } from '../lib/session'
import MessageList from './MessageList'
import Composer from './Composer'
import ExtensionUiDialog from './ExtensionUiDialog'
import UsageMonitor from './UsageMonitor'
import GitChip from './GitChip'
import Logo from './Logo'

interface Suggestion {
  icon: typeof Compass
  labelKey: I18nKey
  descKey: I18nKey
  promptKey: I18nKey
}

const SUGGESTIONS: Suggestion[] = [
  {
    icon: Compass,
    labelKey: 'chat.suggest.explore',
    descKey: 'chat.suggest.explore.desc',
    promptKey: 'chat.suggest.explore.prompt'
  },
  {
    icon: Hammer,
    labelKey: 'chat.suggest.build',
    descKey: 'chat.suggest.build.desc',
    promptKey: 'chat.suggest.build.prompt'
  },
  {
    icon: GitPullRequest,
    labelKey: 'chat.suggest.review',
    descKey: 'chat.suggest.review.desc',
    promptKey: 'chat.suggest.review.prompt'
  },
  {
    icon: Bug,
    labelKey: 'chat.suggest.fix',
    descKey: 'chat.suggest.fix.desc',
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
  const [exporting, setExporting] = useState(false)
  const [exportFailed, setExportFailed] = useState(false)

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

  const handleSend = async (text: string, images?: PromptImage[]) => {
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
    const sent = await window.electronAPI.sendMessage(sessionId, text.trim(), images)
    if (sent) {
      // Snapshot the worktree so this turn can be rolled back later.
      const list = useAppStore.getState().messages[sessionId] || []
      void useAppStore.getState().createCheckpointForMessage(sessionId, list.length - 1, text.trim())
      // First user message of an untitled session becomes its name
      void useAppStore.getState().maybeNameSession(sessionId, text.trim())
    }
  }

  const handleExport = async () => {
    if (!currentSessionId || exporting) return
    setExporting(true)
    setExportFailed(false)
    try {
      const saved = await window.electronAPI.exportHtml(currentSessionId)
      if (!saved) throw new Error('exportHtml returned null')
    } catch (err) {
      console.error('Session export failed:', err)
      setExportFailed(true)
      setTimeout(() => setExportFailed(false), 2000)
    } finally {
      setExporting(false)
    }
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
        {/* The chip duplicates the title while the session is untitled — show it only when it adds the project path context */}
        {projectName && projectName !== currentSession?.title && (
          <span className="flex min-w-0 items-center gap-1.5 rounded-full border border-line bg-overlay px-2 py-[3px] text-cream-dim">
            <FolderOpen size={11} className="shrink-0" />
            <span className="truncate font-mono text-[11px]">{projectName}</span>
          </span>
        )}
        <GitChip />
        <span className="ml-auto flex shrink-0 items-center gap-2.5 text-cream-dim">
          {currentSessionId && (
            <button
              onClick={() => void handleExport()}
              disabled={exporting}
              title={
                exporting
                  ? t('export.exporting')
                  : exportFailed
                    ? t('export.failed')
                    : t('export.button')
              }
              className={`app-no-drag rounded-md p-1.5 transition hover:bg-overlay disabled:opacity-60 ${
                exportFailed ? 'text-red-500' : 'text-cream-dim hover:text-cream'
              }`}
            >
              {exporting ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Download size={13} />
              )}
            </button>
          )}
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
          <div className="flex h-full flex-col items-center justify-center px-8 pb-[14vh]">
            <div className="flex w-full max-w-[640px] flex-col items-center">
              <div className="rise" style={{ animationDelay: '0ms' }}>
                <Logo size={40} />
              </div>
              <h2
                className="rise mb-8 mt-4 text-[26px] font-semibold tracking-[-0.01em] text-cream"
                style={{ animationDelay: '60ms' }}
              >
                {t('chat.hero.title')}
              </h2>
              <div className="grid w-full grid-cols-2 gap-3">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={s.labelKey}
                    onClick={() => handleSend(t(s.promptKey))}
                    disabled={cliAvailable === false}
                    style={{ animationDelay: `${120 + i * 70}ms` }}
                    className="rise group flex flex-col items-start gap-2.5 rounded-[14px] border border-line bg-ink-850 p-4 text-left transition-all duration-150 ease-standard hover:-translate-y-px hover:border-ink-600 hover:shadow-card disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent-soft">
                      <s.icon size={16} className="text-accent" strokeWidth={1.8} />
                    </span>
                    <span className="text-[13px] font-medium leading-5 text-cream">
                      {t(s.labelKey)}
                    </span>
                    <span className="-mt-1.5 truncate text-[12px] leading-5 text-cream-faint">
                      {t(s.descKey)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-[760px]">
            <MessageList messages={sessionMessages} sessionId={currentSessionId} />
            {showThinking && (
              <div className="msg-in flex items-center gap-1 px-6 pb-6">
                <span className="think-dot h-1.5 w-1.5 rounded-full bg-cream-dim" />
                <span className="think-dot h-1.5 w-1.5 rounded-full bg-cream-dim" />
                <span className="think-dot h-1.5 w-1.5 rounded-full bg-cream-dim" />
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
