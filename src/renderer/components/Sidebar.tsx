import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  SquarePen,
  MessageSquare,
  Puzzle,
  FolderOpen,
  AlertCircle,
  Trash2,
  PanelRight,
  Languages,
  Sun,
  Moon,
  Search
} from 'lucide-react'
import { useAppStore } from '../store'
import { useT } from '../i18n'

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
    addSession,
    setCurrentSessionId,
    setSessions,
    setRightPanelOpen,
    setLanguage,
    setTheme
  } = useAppStore()

  useEffect(() => {
    window.electronAPI.getStore('recentProjects').then((projects) => {
      if (projects.length > 0 && !currentProject) {
        setCurrentProject(projects[0])
        window.electronAPI.setFsRoot(projects[0])
      }
    })
  }, [currentProject, setCurrentProject])

  const handleNewChat = async () => {
    let project = currentProject
    if (!project) {
      project = await window.electronAPI.selectFolder()
      if (!project) return
      setCurrentProject(project)
      window.electronAPI.setFsRoot(project)
    }
    const session = await window.electronAPI.createSession(project)
    addSession(session)
    navigate('/')
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

  const timeLocale = language === 'zh' ? 'zh-CN' : 'en-US'

  const navRow = (active: boolean) =>
    `flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition ${
      active
        ? 'bg-overlay-strong font-medium text-cream'
        : 'text-cream-dim hover:bg-overlay hover:text-cream'
    }`

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-ink-900">
      {/* drag spacer — clears the macOS traffic lights */}
      <div className="app-drag h-12 shrink-0" />

      <div className="app-drag flex items-center justify-between px-4 pb-3">
        <span className="text-[15px] font-semibold tracking-tight text-cream">OMP GUI</span>
        <Search size={15} className="text-cream-faint" />
      </div>

      <nav className="space-y-0.5 px-2.5">
        <button onClick={handleNewChat} disabled={cliAvailable === false} className={`${navRow(false)} disabled:cursor-not-allowed disabled:opacity-40`}>
          <SquarePen size={15} className="shrink-0" />
          {t('sidebar.newChat')}
        </button>
        <button onClick={() => navigate('/')} className={navRow(location.pathname === '/')}>
          <MessageSquare size={15} className="shrink-0" />
          {t('sidebar.chat')}
        </button>
        <button onClick={() => navigate('/customize')} className={navRow(location.pathname === '/customize')}>
          <Puzzle size={15} className="shrink-0" />
          {t('sidebar.customize')}
        </button>
        <button onClick={() => setRightPanelOpen(!rightPanelOpen)} className={navRow(rightPanelOpen)}>
          <PanelRight size={15} className="shrink-0" />
          {t('sidebar.rightPanel')}
        </button>
      </nav>

      {cliAvailable === false && (
        <div className="mx-2.5 mt-2 flex items-start gap-2 rounded-lg border border-yellow-500/25 bg-yellow-500/10 p-2 text-xs leading-5 text-yellow-700 dark:text-yellow-200/90">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{t('sidebar.cliMissing')}</span>
        </div>
      )}

      <div className="mt-4 px-2.5">
        <div className="px-2 pb-1 text-[11px] font-medium text-cream-faint">
          {t('sidebar.project')}
        </div>
        <button onClick={handleSelectProject} className={`${navRow(false)} font-mono text-xs`}>
          <FolderOpen size={14} className="shrink-0 text-cream-faint" />
          <span className="truncate">{currentProject || t('sidebar.selectProject')}</span>
        </button>
      </div>

      <div className="mt-4 flex-1 overflow-y-auto px-2.5">
        <div className="px-2 pb-1 text-[11px] font-medium text-cream-faint">
          {t('sidebar.sessions')}
        </div>
        {sessions.length === 0 ? (
          <div className="px-2 py-1.5 text-xs leading-5 text-cream-faint">
            {t('sidebar.noSessions')}
          </div>
        ) : (
          <div className="space-y-0.5">
            {sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => setCurrentSessionId(session.id)}
                className={`group flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 transition ${
                  currentSessionId === session.id ? 'bg-overlay-strong' : 'hover:bg-overlay'
                }`}
              >
                <div className="min-w-0">
                  <div
                    className={`truncate text-[13px] ${
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
                  className="ml-2 shrink-0 rounded-md p-1 text-cream-faint opacity-0 transition hover:bg-red-500/15 hover:text-red-500 group-hover:opacity-100"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 border-t border-line p-2.5">
        <Languages size={13} className="ml-1 shrink-0 text-cream-faint" />
        <div className="flex rounded-lg bg-overlay p-0.5">
          {(['zh', 'en'] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => setLanguage(lang)}
              className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
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
          className="ml-auto rounded-lg p-1.5 text-cream-faint transition hover:bg-overlay hover:text-cream"
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </aside>
  )
}
