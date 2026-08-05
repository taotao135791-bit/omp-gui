import { useEffect, useMemo, useState } from 'react'
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
  ChevronRight
} from 'lucide-react'
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
    setCurrentProject,
    setCurrentSessionId,
    setSessions,
    setRightPanelOpen,
    setLanguage,
    setTheme,
    togglePinSession,
    setSessionArchived
  } = useAppStore()

  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [archiveOpen, setArchiveOpen] = useState(false)

  useEffect(() => {
    window.electronAPI.getStore('recentProjects').then((projects) => {
      if (projects.length > 0 && !currentProject) {
        setCurrentProject(projects[0])
        window.electronAPI.setFsRoot(projects[0])
      }
    })
  }, [currentProject, setCurrentProject])

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

  const handleDeleteSession = (id: string) => {
    window.electronAPI.killSession(id)
    setSessions(sessions.filter((s) => s.id !== id))
    if (currentSessionId === id) {
      setCurrentSessionId(null)
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

  const navRow = (active: boolean) =>
    `group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition-all duration-150 ease-standard ${
      active
        ? 'bg-overlay-strong font-medium text-cream'
        : 'text-cream-dim hover:bg-overlay hover:text-cream'
    }`

  const iconBtn =
    'shrink-0 rounded-md p-1 text-cream-faint opacity-0 transition-all group-hover:opacity-100'

  const renderSessionRow = (session: (typeof sessions)[number]) => {
    const active = currentSessionId === session.id
    const running = Boolean(busy[session.id])
    const unread = !active && Boolean(unreadSessionIds[session.id])
    const pinned = pinnedSet.has(session.id)
    const archived = archivedSet.has(session.id)
    return (
      <div
        key={session.id}
        onClick={() => {
          setCurrentSessionId(session.id)
          navigate('/')
        }}
        className={`group flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-[7px] transition-colors duration-150 ${
          active ? 'bg-overlay-strong' : 'hover:bg-overlay'
        }`}
      >
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            running
              ? 'animate-pulse bg-amber-400'
              : unread
                ? 'bg-accent'
                : active
                  ? 'bg-cream-faint'
                  : 'bg-line-strong'
          }`}
        />
        <div className="min-w-0 flex-1">
          <div
            className={`truncate text-[13px] leading-5 ${
              active ? 'font-medium text-cream' : 'text-cream-dim'
            }`}
          >
            {session.title}
          </div>
          <div className="truncate font-mono text-[10px] leading-4 text-cream-faint">
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
                : `${iconBtn} hover:bg-overlay-strong hover:text-cream`
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
            className={`${iconBtn} hover:bg-overlay-strong hover:text-cream`}
          >
            {archived ? <ArchiveRestore size={12} /> : <Archive size={12} />}
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleDeleteSession(session.id)
          }}
          title={t('sidebar.deleteSession')}
          className={`${iconBtn} hover:bg-red-500/15 hover:text-red-500`}
        >
          <Trash2 size={12} />
        </button>
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
        <button
          onClick={() => {
            setSearchOpen(!searchOpen)
            if (searchOpen) setQuery('')
          }}
          title={t('sidebar.searchSessions')}
          className="app-no-drag focus-ring rounded-md p-1.5 text-cream-faint transition-colors hover:bg-overlay hover:text-cream"
        >
          {searchOpen ? <X size={14} /> : <Search size={14} />}
        </button>
      </div>

      {searchOpen && (
        <div className="px-3 pb-2.5">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('sidebar.searchSessions')}
            className="w-full rounded-lg border border-line bg-ink-850 px-2.5 py-1.5 text-xs text-cream shadow-card placeholder-cream-faint outline-none transition-colors focus:border-line-strong"
          />
        </div>
      )}

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
        <div className="px-2 pb-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-cream-faint">
          {t('sidebar.project')}
        </div>
        <button onClick={handleSelectProject} className={`${navRow(false)} font-mono text-xs`}>
          <FolderOpen size={13} className="shrink-0 text-cream-faint" />
          <span className="truncate">{currentProject || t('sidebar.selectProject')}</span>
        </button>
      </div>

      <div className="mt-5 flex-1 overflow-y-auto px-2.5 pb-2">
        <div className="px-2 pb-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-cream-faint">
          {t('sidebar.sessions')}
        </div>
        {pinnedSessions.length === 0 && normalSessions.length === 0 ? (
          sessions.length === 0 || query.trim() ? (
            <div className="px-2 py-1.5 text-xs leading-5 text-cream-faint">
              {sessions.length === 0 ? t('sidebar.noSessions') : t('sidebar.noMatch')}
            </div>
          ) : null
        ) : (
          <div className="space-y-0.5">
            {[...pinnedSessions, ...normalSessions].map(renderSessionRow)}
          </div>
        )}

        {archivedSessions.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setArchiveOpen(!archiveOpen)}
              className="flex w-full items-center gap-1 px-2 pb-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-cream-faint transition-colors hover:text-cream-dim"
            >
              {archiveOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              {t('sidebar.archived', { count: archivedSessions.length })}
            </button>
            {archiveOpen && <div className="space-y-0.5">{archivedSessions.map(renderSessionRow)}</div>}
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
        <div className="ml-0.5 flex rounded-lg border border-line bg-overlay p-0.5">
          {(['zh', 'en'] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => setLanguage(lang)}
              className={`rounded-md px-2 py-0.5 text-[10.5px] font-medium transition-colors ${
                language === lang
                  ? 'bg-ink-850 text-cream shadow-card'
                  : 'text-cream-dim hover:text-cream'
              }`}
            >
              {lang === 'zh' ? '中' : 'EN'}
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
