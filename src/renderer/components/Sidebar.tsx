import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Plus,
  MessageSquare,
  Puzzle,
  Settings,
  FolderOpen,
  AlertCircle,
  Trash2,
  PanelRight
} from 'lucide-react'
import { useAppStore } from '../store'

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    currentProject,
    sessions,
    currentSessionId,
    cliAvailable,
    rightPanelOpen,
    setCurrentProject,
    addSession,
    setCurrentSessionId,
    setSessions,
    setRightPanelOpen
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

  return (
    <aside className="flex w-64 flex-col border-r border-surface-700 bg-surface-800">
      <div className="flex items-center gap-2 p-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand font-bold text-white">
          π
        </div>
        <span className="font-semibold">OMP GUI</span>
      </div>

      <div className="px-3 pb-2">
        <button
          onClick={handleNewChat}
          disabled={cliAvailable === false}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={16} />
          New Chat
        </button>
        {cliAvailable === false && (
          <div className="mt-2 flex items-start gap-2 rounded-md bg-red-900/30 p-2 text-xs text-red-300">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>omp/pi CLI not found. Install it to use chat.</span>
          </div>
        )}
      </div>

      <div className="px-3 py-2">
        <button
          onClick={handleSelectProject}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-gray-400 hover:bg-surface-700 hover:text-gray-100"
        >
          <FolderOpen size={14} />
          <span className="truncate">{currentProject || 'Select project folder'}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">
          Sessions
        </div>
        {sessions.length === 0 ? (
          <div className="rounded-md bg-surface-700/50 p-3 text-xs text-gray-500">
            No sessions yet. Start a new chat.
          </div>
        ) : (
          <div className="space-y-1">
            {sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => setCurrentSessionId(session.id)}
                className={`group flex cursor-pointer items-center justify-between rounded-md px-2 py-2 text-sm ${
                  currentSessionId === session.id
                    ? 'bg-surface-600 text-white'
                    : 'text-gray-400 hover:bg-surface-700 hover:text-gray-100'
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{session.title}</div>
                  <div className="truncate text-xs opacity-70">
                    {new Date(session.createdAt).toLocaleTimeString()}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteSession(session.id)
                  }}
                  className="ml-2 shrink-0 rounded p-1 text-gray-500 opacity-0 transition hover:bg-red-900/30 hover:text-red-400 group-hover:opacity-100"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-surface-700 p-2">
        <button
          onClick={() => setRightPanelOpen(!rightPanelOpen)}
          className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition ${
            rightPanelOpen ? 'bg-surface-700 text-white' : 'text-gray-400 hover:bg-surface-700'
          }`}
        >
          <PanelRight size={16} />
          Right Panel
        </button>
        <button
          onClick={() => navigate('/')}
          className={`mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition ${
            location.pathname === '/'
              ? 'bg-surface-700 text-white'
              : 'text-gray-400 hover:bg-surface-700'
          }`}
        >
          <MessageSquare size={16} />
          Chat
        </button>
        <button
          onClick={() => navigate('/customize')}
          className={`mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition ${
            location.pathname === '/customize'
              ? 'bg-surface-700 text-white'
              : 'text-gray-400 hover:bg-surface-700'
          }`}
        >
          <Puzzle size={16} />
          Customize Pi
        </button>
        <button className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-400 transition hover:bg-surface-700">
          <Settings size={16} />
          Settings
        </button>
      </div>
    </aside>
  )
}
