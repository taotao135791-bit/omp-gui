import { useRef, useEffect, useState } from 'react'
import { FolderOpen, Download, Loader2, ChevronRight, ChevronDown } from 'lucide-react'
import { PromptImage, SlashCommand } from '@shared/types'
import { useAppStore } from '../store'
import { useT } from '../i18n'
import { createSessionForCurrentProject } from '../lib/session'
import { captureSessionSnapshot } from '../lib/runtimeSnapshot'
import MessageList from './MessageList'
import Composer from './Composer'
import ExtensionUiDialog from './ExtensionUiDialog'
import GitChip from './GitChip'
import Logo from './Logo'

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
  const scrollRef = useRef<HTMLDivElement>(null)
  // Only auto-scroll while the user is pinned to the bottom; scrolling up
  // during streaming must not yank the view back down on every delta.
  const pinnedRef = useRef(true)
  const [showJump, setShowJump] = useState(false)
  // Suppress the scroll handler while a programmatic jump animates — the
  // intermediate positions would otherwise flip pinned off mid-flight.
  const jumpingRef = useRef(false)
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

  // This WebView ignores behavior:'smooth' (scrollTo/scrollIntoView no-op),
  // and rAF is throttled for occluded windows — so bottom-scroll is an
  // instant scrollTop write. Reliability over animation.
  const scrollToBottomNow = () => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }

  useEffect(() => {
    if (pinnedRef.current) scrollToBottomNow()
  }, [sessionMessages, isBusy])

  const handleTranscriptScroll = () => {
    if (jumpingRef.current) return
    const el = scrollRef.current
    if (!el) return
    const pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 48
    pinnedRef.current = pinned
    setShowJump(!pinned)
  }

  const jumpToBottom = () => {
    pinnedRef.current = true
    setShowJump(false)
    jumpingRef.current = true
    scrollToBottomNow()
    // Recompute once the animation settles; if the stream is still appending,
    // the pinned effect above keeps the view glued to the bottom meanwhile.
    setTimeout(() => {
      jumpingRef.current = false
      handleTranscriptScroll()
    }, 500)
  }

  const handleSend = async (text: string, images?: PromptImage[]) => {
    if (!text.trim() || cliAvailable === false) return
    const sessionId = currentSessionId ?? (await createSessionForCurrentProject())
    if (!sessionId) return
    // Snapshot the session's REAL state at dispatch time — the historical
    // turn keeps the model/thinking it actually ran under, never the
    // session's later current state.
    const snap = await captureSessionSnapshot(sessionId)
    useAppStore.getState().addMessage(sessionId, {
      id: crypto.randomUUID(),
      role: 'user',
      kind: 'prompt',
      content: text.trim(),
      images: images?.map(({ data, mimeType }) => ({ data, mimeType })),
      runtimeModel: snap.modelSelector,
      runtimeThinking: snap.thinkingLevel
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
    const sid = currentSessionId
    if (!sid) return
    const store = useAppStore.getState()
    // Cancel pending dialogs first: an unanswered select/confirm holds the
    // turn open, and aborting underneath it wedges the session as busy
    // forever (no agent_end ever arrives).
    for (const req of store.uiRequests[sid] || []) {
      await window.electronAPI.respondUi(sid, req.id, { cancelled: true })
      store.resolveUiRequest(sid, req.id)
    }
    await window.electronAPI.abortSession(sid)
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
      <header className="app-drag flex h-12 shrink-0 items-center gap-2 border-b border-line px-4 text-xs">
        {/* breadcrumb: project / branch / session title */}
        {projectName && (
          <>
            <span
              className="flex min-w-0 items-center gap-1.5 text-cream-dim"
              title={currentProject ?? undefined}
            >
              <FolderOpen size={12} className="shrink-0" />
              <span className="max-w-[160px] truncate text-[12px] font-medium">{projectName}</span>
            </span>
            <ChevronRight size={10} className="shrink-0 text-cream-faint" />
          </>
        )}
        <GitChip trailing={<ChevronRight size={10} className="shrink-0 text-cream-faint" />} />
        <span className="min-w-0 truncate text-[13px] font-semibold tracking-tight text-cream">
          {currentSession ? currentSession.title : t('chat.noActiveSession')}
        </span>
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
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              <span className="font-medium text-amber-500">{t('chat.running')}</span>
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
        <div ref={scrollRef} onScroll={handleTranscriptScroll} className="relative h-full overflow-y-auto">
        {showHero ? (
          // Hero and composer form ONE centered block: mark, serif title,
          // composer — nothing else.
          <div className="flex h-full flex-col items-center px-8">
            <div className="my-auto flex w-full max-w-[680px] flex-col items-center pb-[10vh] pt-6">
              <div className="rise" style={{ animationDelay: '0ms' }}>
                <Logo size={52} />
              </div>
              <h2
                className="rise mb-10 mt-6 font-serif text-[27px] font-medium tracking-[0.01em] text-cream"
                style={{ animationDelay: '60ms' }}
              >
                {t('chat.hero.title')}
              </h2>
              <div className="rise w-full" style={{ animationDelay: '140ms' }}>
                {!currentProject && (
                  <div className="mb-2 flex justify-center">
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
        {showJump && (
          <button
            onClick={jumpToBottom}
            title={t('chat.jumpToBottom')}
            className="absolute bottom-4 right-5 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-line bg-ink-850 text-cream-dim shadow-pop transition-all hover:text-cream"
          >
            <ChevronDown size={14} />
          </button>
        )}
      </div>

      {!currentProject && !showHero && (
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

      {!showHero && (
        <Composer
          onSend={handleSend}
          onStop={handleStop}
          busy={isBusy}
          disabled={cliAvailable === false}
          commands={slashCommands}
          onCompact={currentSessionId ? handleCompact : undefined}
        />
      )}

      {pendingUi && currentSessionId && (
        <ExtensionUiDialog sessionId={currentSessionId} request={pendingUi} />
      )}
    </div>
  )
}
