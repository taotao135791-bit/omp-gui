import { create } from 'zustand'
import { Session, SessionEvent, ModuleInfo, InstallStatus, Language } from '@shared/types'

export interface MessageLike {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  toolCall?: {
    tool: string
    input: unknown
    output?: unknown
  }
}

interface AppState {
  theme: 'dark' | 'light'
  language: Language
  currentProject: string | null
  sessions: Session[]
  currentSessionId: string | null
  messages: Record<string, MessageLike[]>
  modules: ModuleInfo[]
  rightPanelOpen: boolean
  activeRightTab: 'files' | 'preview'
  selectedFile: string | null
  previewContent: string | null
  cliAvailable: boolean | null
  /** null = not yet loaded from disk */
  setupComplete: boolean | null
  installStatus: InstallStatus
  setTheme: (theme: 'dark' | 'light') => void
  setLanguage: (language: Language) => void
  setCurrentProject: (path: string | null) => void
  setSessions: (sessions: Session[]) => void
  addSession: (session: Session) => void
  setCurrentSessionId: (id: string | null) => void
  addMessage: (sessionId: string, message: MessageLike) => void
  appendMessageContent: (sessionId: string, content: string) => void
  setModules: (modules: ModuleInfo[]) => void
  updateModuleEnabled: (id: string, enabled: boolean) => void
  setRightPanelOpen: (open: boolean) => void
  setActiveRightTab: (tab: 'files' | 'preview') => void
  setSelectedFile: (path: string | null) => void
  setPreviewContent: (content: string | null) => void
  setCliAvailable: (available: boolean) => void
  setSetupComplete: (complete: boolean) => void
  setInstallStatus: (status: InstallStatus) => void
  applySessionEvent: (event: SessionEvent) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  theme: 'dark',
  language: 'en',
  currentProject: null,
  sessions: [],
  currentSessionId: null,
  messages: {},
  modules: [],
  rightPanelOpen: true,
  activeRightTab: 'files',
  selectedFile: null,
  previewContent: null,
  cliAvailable: null,
  setupComplete: null,
  installStatus: { type: 'idle' },

  setTheme: (theme) => {
    set({ theme })
    document.documentElement.classList.toggle('dark', theme === 'dark')
  },
  setLanguage: (language) => {
    set({ language })
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
    window.electronAPI.setStore('language', language)
  },
  setCurrentProject: (currentProject) => set({ currentProject }),
  setSessions: (sessions) => set({ sessions }),
  addSession: (session) => set((state) => ({
    sessions: [session, ...state.sessions],
    currentSessionId: session.id
  })),
  setCurrentSessionId: (currentSessionId) => set({ currentSessionId }),
  addMessage: (sessionId, message) => set((state) => ({
    messages: {
      ...state.messages,
      [sessionId]: [...(state.messages[sessionId] || []), message]
    }
  })),
  appendMessageContent: (sessionId, content) => set((state) => {
    const list = state.messages[sessionId] || []
    if (list.length === 0) {
      return {
        messages: {
          ...state.messages,
          [sessionId]: [{ id: crypto.randomUUID(), role: 'assistant', content }]
        }
      }
    }
    const last = list[list.length - 1]
    if (last.role !== 'assistant' || last.toolCall) {
      return {
        messages: {
          ...state.messages,
          [sessionId]: [...list, { id: crypto.randomUUID(), role: 'assistant', content }]
        }
      }
    }
    const updated = [...list]
    updated[updated.length - 1] = { ...last, content: last.content + content }
    return { messages: { ...state.messages, [sessionId]: updated } }
  }),
  setModules: (modules) => set({ modules }),
  updateModuleEnabled: (id, enabled) => set((state) => ({
    modules: state.modules.map((m) => (m.id === id ? { ...m, enabled } : m))
  })),
  setRightPanelOpen: (rightPanelOpen) => set({ rightPanelOpen }),
  setActiveRightTab: (activeRightTab) => set({ activeRightTab }),
  setSelectedFile: (selectedFile) => set({ selectedFile }),
  setPreviewContent: (previewContent) => set({ previewContent }),
  setCliAvailable: (cliAvailable) => set({ cliAvailable }),
  setSetupComplete: (setupComplete) => {
    set({ setupComplete })
    window.electronAPI.setStore('setupComplete', setupComplete)
  },
  setInstallStatus: (installStatus) => set({ installStatus }),

  applySessionEvent: (event) => {
    if (event.type === 'message') {
      if (event.role === 'user') {
        get().addMessage(event.sessionId, {
          id: crypto.randomUUID(),
          role: 'user',
          content: event.content
        })
      } else {
        get().appendMessageContent(event.sessionId, event.content)
      }
    } else if (event.type === 'tool_call') {
      get().addMessage(event.sessionId, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        toolCall: {
          tool: event.tool,
          input: event.input,
          output: event.output
        }
      })
    } else if (event.type === 'error') {
      get().addMessage(event.sessionId, {
        id: crypto.randomUUID(),
        role: 'system',
        content: `Error: ${event.message}`
      })
    }
  }
}))
