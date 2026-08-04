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
  X
} from 'lucide-react'
import { useAppStore } from '../store'
import { useT } from '../i18n'
import { createSessionForCurrentProject } from '../lib/session'

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
    setCurrentProject,
    setCurrentSessionId,
    setSessions,
    setRightPanelOpen,
    setLanguage,
    setTheme
  } = useAppStore()

  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')

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

  const filteredSessions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sessions
    return sessions.filter(
      (s) => s.title.toLowerCase().includes(q) || s.cwd.toLowerCase().includes(q)
    )
  }, [sessions, query])

  const timeLocale = language === 'zh' ? 'zh-CN' : 'en-US'

  const navRow = (active: boolean) =>
    `flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition ${
      active
        ? 'bg-overlay-strong font-medium text-cream'
        : 'text-cream-dim hover:bg-overlay hover:text-cream'
    }`

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-ink-900">
      {/* drag spacer — clears the macOS traffic lights */}
      <div className="app-drag h-12 shrink-0" />

      <div className="app-drag flex items-center justify-between px-3.5 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="brand-mark flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-bold">
            π
          </div>
          <span className="text-[14px] font-semibold tracking-tight text-cream">OMP GUI</span>
        </div>
        <button
          onClick={() => {
            setSearchOpen(!searchOpen)
            if (searchOpen) setQuery('')
          }}
          className="app-no-drag rounded-md p-1 text-cream-faint transition hover:bg-overlay hover:text-cream"
        >
          {searchOpen ? <X size={14} /> : <Search size={14} />}
        </button>
      </div>

      {searchOpen && (
        <div className="px-3 pb-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('sidebar.searchSessions')}
            className="w-full rounded-md border border-line bg-ink-850 px-2.5 py-1.5 text-xs text-cream placeholder-cream-faint outline-none focus:border-ink-600"
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
          <span className="ml-auto text-[10px] text-cream-faint">⌘N</span>
        </button>
        <button onClick={() => navigate('/')} className={navRow(location.pathname === '/')}>
          <MessageSquare size={14} className="shrink-0" />
          {t('sidebar.chat')}
        </button>
        <button
          onClick={() => navigate('/customize')}
          className={navRow(location.pathname === '/customize')}
        >
          <Puzzle size={14} className="shrink-0" />
          {t('sidebar.customize')}
        </button>
        <button onClick={() => setRightPanelOpen(!rightPanelOpen)} className={navRow(rightPanelOpen)}>
          <PanelRight size={14} className="shrink-0" />
          {t('sidebar.rightPanel')}
        </button>
      </nav>

      {cliAvailable === false && (
        <div className="mx-2.5 mt-2 flex items-start gap-2 rounded-md border border-yellow-500/25 bg-yellow-500/10 p-2 text-xs leading-5 text-yellow-700 dark:text-yellow-200/90">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>{t('sidebar.cliMissing')}</span>
        </div>
      )}

      <div className="mt-4 px-2.5">
        <div className="px-2 pb-1 text-[10.5px] font-medium uppercase tracking-wider text-cream-faint">
          {t('sidebar.project')}
        </div>
        <button onClick={handleSelectProject} className={`${navRow(false)} font-mono text-xs`}>
          <FolderOpen size={13} className="shrink-0 text-cream-faint" />
          <span className="truncate">{currentProject || t('sidebar.selectProject')}</span>
        </button>
      </div>

      <div className="mt-4 flex-1 overflow-y-auto px-2.5 pb-2">
        <div className="px-2 pb-1 text-[10.5px] font-medium uppercase tracking-wider text-cream-faint">
          {t('sidebar.sessions')}
        </div>
        {filteredSessions.length === 0 ? (
          <div className="px-2 py-1.5 text-xs leading-5 text-cream-faint">
            {sessions.length === 0 ? t('sidebar.noSessions') : t('sidebar.noMatch')}
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredSessions.map((session) => (
              <div
                key={session.id}
                onClick={() => {
                  setCurrentSessionId(session.id)
                  navigate('/')
                }}
                className={`group flex cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 transition ${
                  currentSessionId === session.id ? 'bg-overlay-strong' : 'hover:bg-overlay'
                }`}
              >
                <div className="min-w-0">
                  <div
                    className={`truncate text-[13px] leading-5 ${
                      currentSessionId === session.id ? 'font-medium text-cream' : 'text-cream-dim'
                    }`}
                  >
                    {session.title}
                  </div>
                  <div className="truncate font-mono text-[10px] text-cream-faint">
                    {new Date(session.createdAt).toLocaleTimeString(timeLocale, {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteSession(session.id)
                  }}
                  className="ml-2 shrink-0 rounded p-1 text-cream-faint opacity-0 transition hover:bg-red-500/15 hover:text-red-500 group-hover:opacity-100"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-0.5 border-t border-line p-2">
        <button
          onClick={() => navigate('/settings')}
          title={t('sidebar.settings')}
          className={`rounded-md p-1.5 transition ${
            location.pathname === '/settings'
              ? 'bg-overlay-strong text-cream'
              : 'text-cream-faint hover:bg-overlay hover:text-cream'
          }`}
        >
          <Settings size={15} />
        </button>
        <div className="ml-1 flex rounded-md bg-overlay p-0.5">
          {(['zh', 'en'] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => setLanguage(lang)}
              className={`rounded px-1.5 py-0.5 text-[10.5px] font-medium transition ${
                language === lang
                  ? 'bg-ink-850 text-cream shadow-sm'
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
          className="ml-auto rounded-md p-1.5 text-cream-faint transition hover:bg-overlay hover:text-cream"
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>
    </aside>
  )
}
