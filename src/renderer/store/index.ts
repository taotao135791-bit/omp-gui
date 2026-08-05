import { create } from 'zustand'
import { Session, SessionEvent, SessionStats, PackageInfo, InstallStatus, Language, ModelConfig, PiModel } from '@shared/types'

export interface MessageLike {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  toolCall?: {
    tool: string
    input: unknown
    output?: unknown
    isError?: boolean
  }
}

/** A pending interactive extension dialog, keyed by session. */
export type UiRequest = Extract<SessionEvent, { type: 'ui_request' }>

interface AppState {
  theme: 'dark' | 'light'
  language: Language
  currentProject: string | null
  sessions: Session[]
  currentSessionId: string | null
  messages: Record<string, MessageLike[]>
  /** sessionId -> pending extension UI dialogs (FIFO) */
  uiRequests: Record<string, UiRequest[]>
  packages: PackageInfo[]
  rightPanelOpen: boolean
  activeRightTab: 'files' | 'preview'
  selectedFile: string | null
  previewContent: string | null
  cliAvailable: boolean | null
  /** null = not yet loaded from disk */
  setupComplete: boolean | null
  installStatus: InstallStatus
  /** Models pi can use right now (credentialed providers); empty until loaded */
  models: PiModel[]
  /** pi's own model configuration; null until loaded */
  modelConfig: ModelConfig | null
  /** sessionId -> whether the agent is currently generating */
  busy: Record<string, boolean>
  /** sessionId -> whether context compaction is running */
  compacting: Record<string, boolean>
  /** sessionId -> latest known token/context usage */
  stats: Record<string, SessionStats>
  setTheme: (theme: 'dark' | 'light') => void
  setLanguage: (language: Language) => void
  setCurrentProject: (path: string | null) => void
  setSessions: (sessions: Session[]) => void
  addSession: (session: Session) => void
  setCurrentSessionId: (id: string | null) => void
  addMessage: (sessionId: string, message: MessageLike) => void
  appendMessageContent: (sessionId: string, content: string) => void
  resolveUiRequest: (sessionId: string, requestId: string) => void
  setPackages: (packages: PackageInfo[]) => void
  updatePackageEnabled: (source: string, enabled: boolean) => void
  setRightPanelOpen: (open: boolean) => void
  setActiveRightTab: (tab: 'files' | 'preview') => void
  setSelectedFile: (path: string | null) => void
  setPreviewContent: (content: string | null) => void
  setCliAvailable: (available: boolean) => void
  setBusy: (sessionId: string, busy: boolean) => void
  setCompacting: (sessionId: string, compacting: boolean) => void
  setStats: (sessionId: string, stats: SessionStats) => void
  setSetupComplete: (complete: boolean) => void
  setInstallStatus: (status: InstallStatus) => void
  /** (Re)load model config + available models from the main process. */
  loadModelState: () => Promise<void>
  /** Persist a model choice and hot-apply it to the live session, if any. */
  selectModel: (provider: string, modelId: string) => Promise<void>
  applySessionEvent: (event: SessionEvent) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  theme: 'light',
  language: 'en',
  currentProject: null,
  sessions: [],
  currentSessionId: null,
  messages: {},
  uiRequests: {},
  packages: [],
  rightPanelOpen: false,
  activeRightTab: 'files',
  selectedFile: null,
  previewContent: null,
  cliAvailable: null,
  setupComplete: null,
  installStatus: { type: 'idle' },
  models: [],
  modelConfig: null,
  busy: {},
  compacting: {},
  stats: {},

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
  resolveUiRequest: (sessionId, requestId) =>
    set((state) => ({
      uiRequests: {
        ...state.uiRequests,
        [sessionId]: (state.uiRequests[sessionId] || []).filter((r) => r.id !== requestId)
      }
    })),
  setPackages: (packages) => set({ packages }),
  updatePackageEnabled: (source, enabled) => set((state) => ({
    packages: state.packages.map((p) => (p.source === source ? { ...p, enabled } : p))
  })),
  setRightPanelOpen: (rightPanelOpen) => set({ rightPanelOpen }),
  setActiveRightTab: (activeRightTab) => set({ activeRightTab }),
  setSelectedFile: (selectedFile) => set({ selectedFile }),
  setPreviewContent: (previewContent) => set({ previewContent }),
  setCliAvailable: (cliAvailable) => set({ cliAvailable }),
  setBusy: (sessionId, busy) =>
    set((state) => ({ busy: { ...state.busy, [sessionId]: busy } })),
  setCompacting: (sessionId, compacting) =>
    set((state) => ({ compacting: { ...state.compacting, [sessionId]: compacting } })),
  setStats: (sessionId, stats) =>
    set((state) => ({ stats: { ...state.stats, [sessionId]: stats } })),
  setSetupComplete: (setupComplete) => {
    set({ setupComplete })
    window.electronAPI.setStore('setupComplete', setupComplete)
  },
  setInstallStatus: (installStatus) => set({ installStatus }),

  loadModelState: async () => {
    const [modelConfig, models] = await Promise.all([
      window.electronAPI.getModelConfig(),
      window.electronAPI.listModels()
    ])
    set({ modelConfig, models })
  },

  selectModel: async (provider, modelId) => {
    await window.electronAPI.setModelConfig({ defaultProvider: provider, defaultModel: modelId })
    const sid = get().currentSessionId
    if (sid) {
      await window.electronAPI.setSessionModel(sid, provider, modelId)
    }
    set((state) => ({
      modelConfig: state.modelConfig
        ? { ...state.modelConfig, defaultProvider: provider, defaultModel: modelId }
        : state.modelConfig
    }))
  },

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
    } else if (event.type === 'tool_result') {
      // Merge the result into the last pending tool call of this session
      const list = get().messages[event.sessionId] || []
      const idx = [...list]
        .reverse()
        .findIndex((m) => m.toolCall && m.toolCall.output === undefined && m.toolCall.tool === event.tool)
      if (idx === -1) {
        get().addMessage(event.sessionId, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: '',
          toolCall: { tool: event.tool, input: undefined, output: event.output, isError: event.isError }
        })
      } else {
        const realIdx = list.length - 1 - idx
        const target = list[realIdx]
        const updated = [...list]
        updated[realIdx] = {
          ...target,
          toolCall: { ...target.toolCall!, output: event.output, isError: event.isError }
        }
        set((state) => ({ messages: { ...state.messages, [event.sessionId]: updated } }))
      }
    } else if (event.type === 'status') {
      set((state) => ({ busy: { ...state.busy, [event.sessionId]: event.status === 'working' } }))
    } else if (event.type === 'compaction') {
      set((state) => ({
        compacting: { ...state.compacting, [event.sessionId]: event.phase === 'start' }
      }))
    } else if (event.type === 'ui_request') {
      set((state) => ({
        uiRequests: {
          ...state.uiRequests,
          [event.sessionId]: [...(state.uiRequests[event.sessionId] || []), event]
        }
      }))
    } else if (event.type === 'error') {
      get().addMessage(event.sessionId, {
        id: crypto.randomUUID(),
        role: 'system',
        content: `Error: ${event.message}`
      })
      // A dead session can't answer dialogs — drop them
      set((state) => ({ uiRequests: { ...state.uiRequests, [event.sessionId]: [] } }))
    } else if (event.type === 'closed') {
      set((state) => ({
        busy: { ...state.busy, [event.sessionId]: false },
        compacting: { ...state.compacting, [event.sessionId]: false },
        uiRequests: { ...state.uiRequests, [event.sessionId]: [] }
      }))
    }
  }
}))
