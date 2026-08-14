import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  SquarePen,
  MessageSquare,
  Puzzle,
  FolderOpen,
  AlertCircle,
  Trash2,
  PanelRight,
  Sun,
  Moon,
  Search,
  Settings,
  X,
  Pin,
  PinOff,
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  Loader2
} from 'lucide-react'
import { HistorySessionInfo } from '@shared/types'
import { useAppStore } from '../store'
import { useT } from '../i18n'
import { createSessionForCurrentProject } from '../lib/session'
import { formatRelativeTime } from '../lib/time'
import Logo from './Logo'

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const t = useT()
  const {
    currentProject,
    sessions,
    currentSessionId,
    cliAvailable,
    rightPanelOpen,
    language,
    theme,
    busy,
    messages,
    pinnedSessionIds,
    archivedSessionIds,
    unreadSessionIds,
    uiRequests,
    historySessions,
    recentProjects,
    setCurrentProject,
    setCurrentSessionId,
    setSessions,
    setRightPanelOpen,
    setLanguage,
    setTheme,
    togglePinSession,
    setSessionArchived,
    addSession,
    setMessages,
    loadHistorySessions,
    removeHistorySession,
    setRecentProjects,
    removeRecentProject
  } = useAppStore()

  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [projectsExpanded, setProjectsExpanded] = useState(false)
  const [resumingPath, setResumingPath] = useState<string | null>(null)
  const [restoreFailedPath, setRestoreFailedPath] = useState<string | null>(null)
  const [confirmDeletePath, setConfirmDeletePath] = useState<string | null>(null)
  const [confirmDeleteSessionId, setConfirmDeleteSessionId] = useState<string | null>(null)
  const [deleteFailedPath, setDeleteFailedPath] = useState<string | null>(null)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // One-time bootstrap of the most-recent project: only before the initial
  // hydration completes. A user explicitly clearing the current project must
  // NOT be yanked back to projects[0]. This effect runs ONCE on mount (deps
  // are the stable store setters) — re-reading the persistence store on every
  // `currentProject` change was the MRU race: a stale read could clobber the
  // on-disk list with a single-entry list mid-hydration.
  const hydratedRecent = useRef(false)

  useEffect(() => {
    window.electronAPI.getStore('recentProjects').then((projects) => {
      setRecentProjects(projects)
      if (hydratedRecent.current) return
      hydratedRecent.current = true
      if (projects.length > 0 && !useAppStore.getState().currentProject) {
        setCurrentProject(projects[0])
        window.electronAPI.setFsRoot(projects[0])
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setCurrentProject, setRecentProjects])

  // Load the persisted session history on startup and whenever the project changes
  useEffect(() => {
    void loadHistorySessions(currentProject)
  }, [currentProject, loadHistorySessions])

  const handleNewChat = async () => {
    const id = await createSessionForCurrentProject()
    if (id) navigate('/')
  }

  const handleSelectProject = async () => {
    const folder = await window.electronAPI.selectFolder()
    if (folder) {
      setCurrentProject(folder)
      window.electronAPI.setFsRoot(folder)
    }
  }

  // Switching projects reloads the session history via the currentProject effect
  const handleSwitchProject = (path: string) => {
    if (path === currentProject) return
    setCurrentProject(path)
    window.electronAPI.setFsRoot(path)
  }

  const handleDeleteSession = (id: string) => {
    window.electronAPI.killSession(id)
    setSessions(sessions.filter((s) => s.id !== id))
    if (currentSessionId === id) {
      setCurrentSessionId(null)
    }
    // The killed session's file may now appear in the on-disk history
    void loadHistorySessions(currentProject)
  }

  const handleResumeHistory = async (info: HistorySessionInfo) => {
    if (resumingPath) return
    // A history session belongs to a project. When none is selected, derive it
    // from the session itself so clicking always opens the chat (never a
    // no-op that just stays on the home page).
    const project = currentProject ?? info.cwd
    if (!project) return
    setResumingPath(info.filePath)
    setRestoreFailedPath(null)
    try {
      if (!currentProject) {
        setCurrentProject(project)
        window.electronAPI.setFsRoot(project)
      }
      const result = await window.electronAPI.resumeSession(project, info.filePath)
      if (!result) {
        setRestoreFailedPath(info.filePath)
        console.error('Failed to resume session:', info.filePath)
        return
      }
      const { session, messages: restored } = result
      // The main process titles a resumed session after the project dir;
      // prefer the richer title from the history entry when there is one.
      const projectName = project.split('/').filter(Boolean).pop()
      const title =
        (!session.title || session.title === projectName) && info.title !== 'Untitled'
          ? info.title
          : session.title
      addSession({ ...session, title })
      setMessages(session.id, restored)
      setCurrentSessionId(session.id)
      navigate('/')
    } finally {
      setResumingPath(null)
    }
  }

  const handleDeleteHistory = async (info: HistorySessionInfo) => {
    if (confirmDeletePath !== info.filePath) {
      setConfirmDeletePath(info.filePath)
      setDeleteFailedPath(null)
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
      confirmTimer.current = setTimeout(() => setConfirmDeletePath(null), 3000)
      return
    }
    setConfirmDeletePath(null)
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
    const ok = await window.electronAPI.deleteSessionFile(info.filePath)
    // Only the history entry goes away on success — a failed delete keeps the
    // item and surfaces a user-visible error (never silent success).
    if (ok) {
      setDeleteFailedPath(null)
      removeHistorySession(info.filePath)
    } else {
      setDeleteFailedPath(info.filePath)
      setTimeout(() => setDeleteFailedPath((p) => (p === info.filePath ? null : p)), 3000)
    }
  }

  const pinnedSet = useMemo(() => new Set(pinnedSessionIds), [pinnedSessionIds])
  const archivedSet = useMemo(() => new Set(archivedSessionIds), [archivedSessionIds])

  const filteredSessions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sessions
    return sessions.filter((s) => {
      if (s.title.toLowerCase().includes(q) || s.cwd.toLowerCase().includes(q)) return true
      const list = messages[s.id]
      const last = list?.[list.length - 1]
      return last ? last.content.toLowerCase().includes(q) : false
    })
  }, [sessions, query, messages])

  // Pinned sessions first, each group keeping its original order
  const pinnedSessions = useMemo(
    () => filteredSessions.filter((s) => pinnedSet.has(s.id) && !archivedSet.has(s.id)),
    [filteredSessions, pinnedSet, archivedSet]
  )
  const normalSessions = useMemo(
    () => filteredSessions.filter((s) => !pinnedSet.has(s.id) && !archivedSet.has(s.id)),
    [filteredSessions, pinnedSet, archivedSet]
  )
  const archivedSessions = useMemo(
    () => filteredSessions.filter((s) => archivedSet.has(s.id)),
    [filteredSessions, archivedSet]
  )

  // ---- group live sessions by their project (session.cwd) --------------
  // Known projects are the ones in recentProjects plus the current project;
  // anything else lands in a bottom "untied to a project" group.
  const projectOrder = useMemo(() => {
    const order: string[] = []
    if (currentProject) order.push(currentProject)
    for (const p of recentProjects) if (!order.includes(p)) order.push(p)
    return order
  }, [currentProject, recentProjects])

  const sessionCwdSet = useMemo(() => {
    const set = new Set<string>()
    for (const s of sessions) if (s.cwd) set.add(s.cwd)
    return set
  }, [sessions])

  const groupedProjectCwds = useMemo(
    () => projectOrder.filter((p) => sessionCwdSet.has(p)),
    [projectOrder, sessionCwdSet]
  )

  const untiedSessions = useMemo(
    () => sessions.filter((s) => !projectOrder.includes(s.cwd) && !archivedSet.has(s.id)),
    [sessions, projectOrder, archivedSet]
  )

  const renderProjectGroup = (cwd: string) => {
    const group = sessions.filter((s) => s.cwd === cwd && !archivedSet.has(s.id))
    const pinned = group.filter((s) => pinnedSet.has(s.id))
    const normal = group.filter((s) => !pinnedSet.has(s.id))
    const name = cwd.split('/').filter(Boolean).pop() ?? cwd
    return (
      <div key={cwd} className="mt-2">
        <div className="truncate px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-cream-faint/80">
          {name}
        </div>
        <div className="space-y-0.5">{[...pinned, ...normal].map(renderSessionRow)}</div>
      </div>
    )
  }

  // Search results never fold; the default grouped view shows every session.
  const searching = query.trim().length > 0

  const PROJECT_FOLD_LIMIT = 5
  const visibleProjects = projectsExpanded
    ? recentProjects
    : recentProjects.slice(0, PROJECT_FOLD_LIMIT)

  // History entries whose file belongs to a live session (resumed from it or
  // freshly created into it) are hidden; the search box filters by title too.
  const visibleHistory = useMemo(() => {
    const live = new Set(
      sessions.flatMap((s) => [s.resumeFrom, s.sessionFile]).filter(Boolean)
    )
    let list = historySessions.filter((h) => !live.has(h.filePath))
    const q = query.trim().toLowerCase()
    if (q) list = list.filter((h) => h.title.toLowerCase().includes(q))
    return list
  }, [historySessions, sessions, query])

  const navRow = (active: boolean) =>
    `group flex h-8 w-full items-center gap-2.5 rounded-lg border px-2.5 text-[13px] transition-all duration-150 ease-standard ${
      active
        ? 'border-line bg-ink-850 font-medium text-cream shadow-card'
        : 'border-transparent text-cream-dim hover:bg-overlay hover:text-cream'
    }`

  const iconBtn =
    'shrink-0 rounded-md p-1 text-cream-faint opacity-0 transition-all group-hover:opacity-100'

  const renderSessionRow = (session: (typeof sessions)[number]) => {
    const active = currentSessionId === session.id
    const running = Boolean(busy[session.id])
    const unread = !active && Boolean(unreadSessionIds[session.id])
    // A background session waiting on an approval/plugin dialog needs the
    // user — outranks the plain working dot.
    const waiting = !active && (uiRequests[session.id] || []).length > 0
    const pinned = pinnedSet.has(session.id)
    const archived = archivedSet.has(session.id)
    return (
      <div
        key={session.id}
        onClick={() => {
          setCurrentSessionId(session.id)
          navigate('/')
        }}
        className={`group flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-[6px] transition-all duration-150 ease-standard ${
          active ? 'border-line bg-ink-850 shadow-card' : 'border-transparent hover:bg-overlay'
        }`}
      >
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            waiting
              ? 'animate-pulse bg-red-400'
              : running
                ? 'animate-pulse bg-amber-400'
                : unread
                  ? 'bg-accent'
                  : active
                    ? 'bg-cream-faint'
                    : 'bg-line-strong'
          }`}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium leading-5 text-cream">
            {session.title}
          </div>
          <div className="truncate text-[11px] leading-4 text-cream-faint">
            {formatRelativeTime(session.createdAt, language)}
          </div>
        </div>
        {!archived && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              togglePinSession(session.id)
            }}
            title={pinned ? t('sidebar.unpin') : t('sidebar.pin')}
            className={
              pinned
                ? 'shrink-0 rounded-md p-1 text-accent transition-all hover:bg-overlay-strong'
                : `${iconBtn} hover:bg-overlay-strong hover:text-cream-dim`
            }
          >
            {pinned ? <PinOff size={12} /> : <Pin size={12} />}
          </button>
        )}
        {/* The live session can't be archived */}
        {!active && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setSessionArchived(session.id, !archived)
            }}
            title={archived ? t('sidebar.unarchive') : t('sidebar.archive')}
            className={`${iconBtn} hover:bg-overlay-strong hover:text-cream-dim`}
          >
            {archived ? <ArchiveRestore size={12} /> : <Archive size={12} />}
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            // Two-stage confirm: deleting kills the live pi process.
            if (confirmDeleteSessionId !== session.id) {
              setConfirmDeleteSessionId(session.id)
              if (confirmTimer.current) clearTimeout(confirmTimer.current)
              confirmTimer.current = setTimeout(() => setConfirmDeleteSessionId(null), 3000)
              return
            }
            if (confirmTimer.current) clearTimeout(confirmTimer.current)
            setConfirmDeleteSessionId(null)
            handleDeleteSession(session.id)
          }}
          title={
            confirmDeleteSessionId === session.id
              ? t('sidebar.deleteConfirm')
              : t('sidebar.deleteSession')
          }
          className={
            confirmDeleteSessionId === session.id
              ? 'shrink-0 rounded-md bg-red-500/15 p-1 text-red-500 transition-all'
              : `${iconBtn} hover:bg-red-500/15 hover:text-red-500`
          }
        >
          <Trash2 size={12} />
        </button>
      </div>
    )
  }

  const renderHistoryRow = (info: HistorySessionInfo) => {
    const resuming = resumingPath === info.filePath
    const confirming = confirmDeletePath === info.filePath
    const failed = restoreFailedPath === info.filePath
    return (
      <div
        key={info.filePath}
        onClick={() => void handleResumeHistory(info)}
        title={info.filePath}
        className={`group flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-[6px] transition-colors duration-150 hover:bg-overlay ${
          resuming ? 'pointer-events-none opacity-60' : ''
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] leading-5 text-cream-dim">
            {info.title === 'Untitled' ? t('history.untitled') : info.title}
          </div>
          <div
            className={`truncate text-[11px] leading-4 ${
              failed || deleteFailedPath === info.filePath
                ? 'text-red-500'
                : 'text-cream-faint/70'
            }`}
          >
            {failed
              ? t('history.restoreFailed')
              : deleteFailedPath === info.filePath
                ? t('history.deleteFailed')
                : formatRelativeTime(info.timestamp, language)}
          </div>
        </div>
        {resuming ? (
          <Loader2 size={12} className="shrink-0 animate-spin text-cream-faint" />
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation()
              void handleDeleteHistory(info)
            }}
            title={confirming ? t('history.deleteConfirm') : t('history.delete')}
            className={
              confirming
                ? 'shrink-0 rounded-md bg-red-500/15 p-1 text-red-500 transition-all'
                : `${iconBtn} hover:bg-red-500/15 hover:text-red-500`
            }
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    )
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-ink-900">
      {/* drag spacer — clears the macOS traffic lights */}
      <div className="app-drag h-11 shrink-0" />

      <div className="app-drag flex items-center justify-between px-3.5 pb-3">
        <div className="flex items-center gap-2.5">
          <Logo size={22} className="shrink-0" />
          <span className="text-[13.5px] font-semibold tracking-tight text-cream">OMP GUI</span>
        </div>
      </div>

      <nav className="space-y-0.5 px-2.5">
        <button
          onClick={handleNewChat}
          disabled={cliAvailable === false}
          className={`${navRow(false)} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <SquarePen size={14} className="shrink-0" />
          {t('sidebar.newChat')}
          <span className="kbd ml-auto opacity-0 transition-opacity group-hover:opacity-100">⌘N</span>
        </button>
        <button onClick={() => navigate('/')} className={navRow(location.pathname === '/')}>
          <MessageSquare size={14} className="shrink-0" />
          {t('sidebar.chat')}
        </button>
        <button
          onClick={() => navigate('/plugins')}
          className={navRow(location.pathname === '/plugins')}
        >
          <Puzzle size={14} className="shrink-0" />
          {t('sidebar.plugins')}
        </button>
        <button onClick={() => setRightPanelOpen(!rightPanelOpen)} className={navRow(rightPanelOpen)}>
          <PanelRight size={14} className="shrink-0" />
          {t('sidebar.rightPanel')}
        </button>
      </nav>

      {cliAvailable === false && (
        <div className="mx-2.5 mt-2.5 flex items-start gap-2 rounded-lg border border-yellow-500/25 bg-yellow-500/10 p-2.5 text-xs leading-5 text-yellow-700 dark:text-yellow-200/90">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>{t('sidebar.cliMissing')}</span>
        </div>
      )}

      <div className="mt-5 px-2.5">
        <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-cream-faint">
          {t('sidebar.project')}
        </div>
        {currentProject ? (
          <div className={`${navRow(true)} cursor-default font-mono text-xs`}>
            <FolderOpen size={13} className="shrink-0 text-cream-faint" />
            <span className="min-w-0 flex-1 truncate">{currentProject}</span>
            <button
              onClick={handleSelectProject}
              title={t('sidebar.selectProject')}
              className="shrink-0 rounded-md p-1 text-cream-faint transition-colors hover:bg-overlay hover:text-cream"
            >
              <FolderOpen size={12} />
            </button>
          </div>
        ) : (
          <button onClick={handleSelectProject} className={`${navRow(false)} font-mono text-xs`}>
            <FolderOpen size={13} className="shrink-0 text-cream-faint" />
            <span className="truncate">{t('sidebar.selectProject')}</span>
          </button>
        )}
        {recentProjects.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {visibleProjects.map((path) => {
              const name = path.split('/').filter(Boolean).pop() ?? path
              return (
                <div
                  key={path}
                  onClick={() => handleSwitchProject(path)}
                  title={path}
                  className={`${navRow(path === currentProject)} cursor-pointer`}
                >
                  <FolderOpen size={13} className="shrink-0 text-cream-faint" />
                  <span className="truncate">{name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeRecentProject(path)
                    }}
                    title={t('sidebar.removeRecent')}
                    className={`${iconBtn} ml-auto hover:bg-overlay-strong hover:text-cream-dim`}
                  >
                    <X size={12} />
                  </button>
                </div>
              )
            })}
            {recentProjects.length > PROJECT_FOLD_LIMIT && (
              <button
                onClick={() => setProjectsExpanded(!projectsExpanded)}
                className="flex w-full items-center gap-1 px-2 pb-1 pt-1.5 text-[11px] text-cream-faint transition-colors hover:text-cream-dim"
              >
                {projectsExpanded ? (
                  <ChevronDown size={11} strokeWidth={1.5} />
                ) : (
                  <ChevronRight size={11} strokeWidth={1.5} />
                )}
                {projectsExpanded
                  ? t('sidebar.showLess')
                  : t('sidebar.showMore', { count: recentProjects.length - PROJECT_FOLD_LIMIT })}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-5 flex-1 overflow-y-auto px-2.5 pb-4">
        <div className="flex items-center justify-between px-2 pb-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-cream-faint">
            {t('sidebar.sessions')}
          </span>
          <button
            onClick={() => {
              setSearchOpen(!searchOpen)
              if (searchOpen) setQuery('')
            }}
            title={t('sidebar.searchSessions')}
            className="rounded-md p-1 text-cream-faint transition-colors hover:bg-overlay hover:text-cream"
          >
            {searchOpen ? <X size={12} /> : <Search size={12} />}
          </button>
        </div>
        {searchOpen && (
          <div className="px-2 pb-2">
            <div className="relative">
              <Search
                size={12}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-cream-faint"
              />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setSearchOpen(false)
                    setQuery('')
                  }
                }}
                placeholder={t('sidebar.searchSessions')}
                className="h-7 w-full rounded-full border border-line bg-ink-850 pl-7 pr-2.5 text-[12px] text-cream placeholder-cream-faint outline-none transition-colors focus:border-accent/50"
              />
            </div>
          </div>
        )}
        {searching ? (
          // Search: flat filtered list (grouping is only for the default view).
          filteredSessions.length === 0 ? (
            <div className="px-2 py-1.5 text-xs leading-5 text-cream-faint">{t('sidebar.noMatch')}</div>
          ) : (
            <div className="space-y-0.5">{[...pinnedSessions, ...normalSessions].map(renderSessionRow)}</div>
          )
        ) : sessions.length === 0 ? (
          <div className="px-2 py-1.5 text-xs leading-5 text-cream-faint">{t('sidebar.noSessions')}</div>
        ) : (
          <>
            {groupedProjectCwds.map(renderProjectGroup)}
            {untiedSessions.length > 0 && (
              <div className="mt-2">
                <div className="truncate px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-cream-faint/80">
                  {t('chat.noProject')}
                </div>
                <div className="space-y-0.5">
                  {[...untiedSessions.filter((s) => pinnedSet.has(s.id)), ...untiedSessions.filter((s) => !pinnedSet.has(s.id))].map(renderSessionRow)}
                </div>
              </div>
            )}
          </>
        )}

        {archivedSessions.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setArchiveOpen(!archiveOpen)}
              className="flex w-full items-center gap-1 px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-cream-faint transition-colors hover:text-cream-dim"
            >
              {archiveOpen ? (
                <ChevronDown size={11} strokeWidth={1.5} />
              ) : (
                <ChevronRight size={11} strokeWidth={1.5} />
              )}
              {t('sidebar.archived', { count: archivedSessions.length })}
            </button>
            {archiveOpen && <div className="space-y-0.5">{archivedSessions.map(renderSessionRow)}</div>}
          </div>
        )}

        {visibleHistory.length > 0 && (
          <div className="mt-4">
            <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-cream-faint">
              {t('history.title')}
            </div>
            <div className="space-y-0.5">{visibleHistory.map(renderHistoryRow)}</div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 border-t border-line px-2.5 py-2">
        <button
          onClick={() => navigate('/settings')}
          title={t('sidebar.settings')}
          className={`focus-ring rounded-md p-1.5 transition-colors ${
            location.pathname === '/settings'
              ? 'bg-overlay-strong text-cream'
              : 'text-cream-faint hover:bg-overlay hover:text-cream'
          }`}
        >
          <Settings size={15} />
        </button>
        <div className="ml-0.5 flex rounded-full border border-line bg-ink-800 p-0.5">
          {(['zh', 'en'] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => setLanguage(lang)}
              className={`rounded-full border px-2 py-0.5 text-[10.5px] font-medium transition-colors ${
                language === lang
                  ? 'border-line bg-ink-850 text-cream shadow-card'
                  : 'border-transparent text-cream-dim hover:text-cream'
              }`}
            >
              {lang === 'zh' ? t('settings.languageZh') : t('settings.languageEn')}
            </button>
          ))}
        </div>
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={t('sidebar.theme')}
          className="focus-ring ml-auto rounded-md p-1.5 text-cream-faint transition-colors hover:bg-overlay hover:text-cream"
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>
    </aside>
  )
}
