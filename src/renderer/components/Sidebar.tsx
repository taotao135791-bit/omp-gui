import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Plus,
  MessageSquare,
  Puzzle,
  FolderOpen,
  AlertCircle,
  Trash2,
  PanelRight,
  Languages
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
    setCurrentProject,
    addSession,
    setCurrentSessionId,
    setSessions,
    setRightPanelOpen,
    setLanguage
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

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-white/[0.07] bg-ink-900">
      {/* drag spacer — clears the macOS traffic lights */}
      <div className="app-drag h-10 shrink-0" />

      <div className="app-drag flex items-center gap-2.5 px-4 pb-4">
        <div className="brand-gradient flex h-8 w-8 items-center justify-center rounded-xl text-base font-bold text-ink-950 shadow-md shadow-indigo-500/25">
          π
        </div>
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold tracking-tight text-cream">OMP GUI</div>
          <div className="font-mono text-[10px] tracking-wide text-cream-faint">oh my pi · harness</div>
        </div>
      </div>

      <div className="px-3 pb-3">
        <button
          onClick={handleNewChat}
          disabled={cliAvailable === false}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-cream text-sm font-medium text-ink-950 shadow-sm transition hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={15} />
          {t('sidebar.newChat')}
        </button>
        {cliAvailable === false && (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-2 text-xs leading-5 text-yellow-200/90">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{t('sidebar.cliMissing')}</span>
          </div>
        )}
      </div>

      <div className="px-3 pb-2">
        <button
          onClick={handleSelectProject}
          className="flex w-full items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 text-left text-xs text-cream-dim transition hover:border-white/[0.1] hover:bg-white/[0.05] hover:text-cream"
        >
          <FolderOpen size={13} className="shrink-0 text-cream-faint" />
          <span className="truncate font-mono">{currentProject || t('sidebar.selectProject')}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        <div className="mb-2 flex items-center gap-2 px-1">
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-cream-faint">
            {t('sidebar.sessions')}
          </span>
          <span className="h-px flex-1 bg-white/[0.06]" />
        </div>
        {sessions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.08] p-3.5 text-xs leading-5 text-cream-faint">
            {t('sidebar.noSessions')}
          </div>
        ) : (
          <div className="space-y-0.5">
            {sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => setCurrentSessionId(session.id)}
                className={`group flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 transition ${
                  currentSessionId === session.id
                    ? 'bg-white/[0.07] ring-1 ring-white/[0.06]'
                    : 'hover:bg-white/[0.04]'
                }`}
              >
                <div className="min-w-0">
                  <div className={`truncate text-[13px] font-medium ${currentSessionId === session.id ? 'text-cream' : 'text-cream-dim'}`}>
                    {session.title}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[10px] text-cream-faint">
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
                  className="ml-2 shrink-0 rounded-md p-1 text-cream-faint opacity-0 transition hover:bg-red-500/15 hover:text-red-300 group-hover:opacity-100"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-white/[0.07] p-2">
        <div className="mb-1 flex items-center gap-2 rounded-lg px-2 py-1.5">
          <Languages size={13} className="shrink-0 text-cream-faint" />
          <span className="text-xs text-cream-faint">{t('sidebar.language')}</span>
          <div className="ml-auto flex rounded-lg bg-white/[0.06] p-0.5">
            {(['zh', 'en'] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => setLanguage(lang)}
                className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                  language === lang
                    ? 'bg-cream text-ink-950 shadow-sm'
                    : 'text-cream-dim hover:text-cream'
                }`}
              >
                {lang === 'zh' ? '中' : 'EN'}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => setRightPanelOpen(!rightPanelOpen)}
          className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition ${
            rightPanelOpen ? 'bg-white/[0.07] text-cream' : 'text-cream-dim hover:bg-white/[0.04] hover:text-cream'
          }`}
        >
          <PanelRight size={15} />
          {t('sidebar.rightPanel')}
        </button>
        <button
          onClick={() => navigate('/')}
          className={`mt-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition ${
            location.pathname === '/'
              ? 'bg-white/[0.07] text-cream'
              : 'text-cream-dim hover:bg-white/[0.04] hover:text-cream'
          }`}
        >
          <MessageSquare size={15} />
          {t('sidebar.chat')}
        </button>
        <button
          onClick={() => navigate('/customize')}
          className={`mt-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition ${
            location.pathname === '/customize'
              ? 'bg-white/[0.07] text-cream'
              : 'text-cream-dim hover:bg-white/[0.04] hover:text-cream'
          }`}
        >
          <Puzzle size={15} />
          {t('sidebar.customize')}
        </button>
      </div>
    </aside>
  )
}
