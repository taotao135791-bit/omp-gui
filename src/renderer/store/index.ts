import { create } from 'zustand'
import { Session, SessionEvent, SessionStats, PackageInfo, InstallStatus, Language, ModelConfig, PiModel, PromptImage } from '@shared/types'

export interface MessageLike {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  /** system messages only: 'info' renders neutral instead of the error style. */
  variant?: 'info'
  toolCall?: {
    tool: string
    input: unknown
    output?: unknown
    isError?: boolean
  }
}

/** A message parked while the session is busy; drained FIFO on idle. */
export interface QueuedMessage {
  id: string
  text: string
  images?: PromptImage[]
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
  activeRightTab: 'files' | 'preview' | 'changes'
  selectedFile: string | null
  previewContent: string | null
  /** sessionId -> checkpoint creation failed once (non-git project); skip further attempts. */
  checkpointUnavailable: Record<string, boolean>
  /** Bumped after a rollback so git views (changes tab, header chip) refetch. */
  gitInfoVersion: number
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
  /** sessionId -> messages queued while the session is busy (FIFO) */
  queuedMessages: Record<string, QueuedMessage[]>
  /** sessionId -> whether context compaction is running */
  compacting: Record<string, boolean>
  /** sessionId -> latest known token/context usage */
  stats: Record<string, SessionStats>
  /** Sidebar: pinned sessions, listed first (persisted in electron-store). */
  pinnedSessionIds: string[]
  /** Sidebar: archived sessions, folded into the archive group (persisted). */
  archivedSessionIds: string[]
  /** sessionId -> finished a turn while not selected; cleared on select. In-memory only. */
  unreadSessionIds: Record<string, boolean>
  /** One-shot composer prefill (e.g. "build your own plugin" from the packages page). */
  composerPrefill: string | null
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
  setActiveRightTab: (tab: 'files' | 'preview' | 'changes') => void
  setSelectedFile: (path: string | null) => void
  setPreviewContent: (content: string | null) => void
  setCheckpointUnavailable: (sessionId: string, unavailable: boolean) => void
  bumpGitInfoVersion: () => void
  /**
   * Snapshot the project after a user message was accepted by the session.
   * No-op for sessions already known to live outside a git repo; the first
   * null result marks the session unavailable so later messages skip the IPC.
   */
  createCheckpointForMessage: (sessionId: string, msgIndex: number, text: string) => Promise<void>
  setCliAvailable: (available: boolean) => void
  setBusy: (sessionId: string, busy: boolean) => void
  /** Append a message to the session's queue. */
  enqueueQueuedMessage: (sessionId: string, message: QueuedMessage) => void
  /** Remove one queued message by id. */
  removeQueuedMessage: (sessionId: string, id: string) => void
  /** Pop the first queued message (returns it, or undefined when empty). */
  shiftQueuedMessage: (sessionId: string) => QueuedMessage | undefined
  /** Drop every queued message of a session. */
  clearQueuedMessages: (sessionId: string) => void
  setCompacting: (sessionId: string, compacting: boolean) => void
  setStats: (sessionId: string, stats: SessionStats) => void
  /** Replace the pinned list (startup load; does not persist). */
  setPinnedSessionIds: (ids: string[]) => void
  /** Toggle a session's pin and persist the new list. */
  togglePinSession: (sessionId: string) => void
  /** Replace the archived list (startup load; does not persist). */
  setArchivedSessionIds: (ids: string[]) => void
  /** Archive/unarchive a session and persist the new list. */
  setSessionArchived: (sessionId: string, archived: boolean) => void
  markSessionUnread: (sessionId: string) => void
  clearSessionUnread: (sessionId: string) => void
  setComposerPrefill: (text: string | null) => void
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
  checkpointUnavailable: {},
  gitInfoVersion: 0,
  cliAvailable: null,
  setupComplete: null,
  installStatus: { type: 'idle' },
  models: [],
  modelConfig: null,
  busy: {},
  queuedMessages: {},
  compacting: {},
  stats: {},
  pinnedSessionIds: [],
  archivedSessionIds: [],
  unreadSessionIds: {},
  composerPrefill: null,

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
  setSessions: (sessions) =>
    set((state) => {
      // Prune pin/archive/unread entries of sessions that no longer exist
      const ids = new Set(sessions.map((s) => s.id))
      const pinnedSessionIds = state.pinnedSessionIds.filter((id) => ids.has(id))
      const archivedSessionIds = state.archivedSessionIds.filter((id) => ids.has(id))
      if (pinnedSessionIds.length !== state.pinnedSessionIds.length) {
        window.electronAPI.setStore('pinnedSessionIds', pinnedSessionIds)
      }
      if (archivedSessionIds.length !== state.archivedSessionIds.length) {
        window.electronAPI.setStore('archivedSessionIds', archivedSessionIds)
      }
      const unreadSessionIds = Object.fromEntries(
        Object.entries(state.unreadSessionIds).filter(([id]) => ids.has(id))
      )
      return { sessions, pinnedSessionIds, archivedSessionIds, unreadSessionIds }
    }),
  addSession: (session) => set((state) => ({
    sessions: [session, ...state.sessions],
    currentSessionId: session.id
  })),
  setCurrentSessionId: (currentSessionId) =>
    set((state) => ({
      currentSessionId,
      // Selecting a session marks it read
      unreadSessionIds:
        currentSessionId && state.unreadSessionIds[currentSessionId]
          ? { ...state.unreadSessionIds, [currentSessionId]: false }
          : state.unreadSessionIds
    })),
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
  setCheckpointUnavailable: (sessionId, unavailable) =>
    set((state) =>
      state.checkpointUnavailable[sessionId] === unavailable
        ? state
        : { checkpointUnavailable: { ...state.checkpointUnavailable, [sessionId]: unavailable } }
    ),
  bumpGitInfoVersion: () => set((state) => ({ gitInfoVersion: state.gitInfoVersion + 1 })),
  createCheckpointForMessage: async (sessionId, msgIndex, text) => {
    if (get().checkpointUnavailable[sessionId] === true) return
    const info = await window.electronAPI.checkpointCreate(sessionId, msgIndex, text.slice(0, 80))
    get().setCheckpointUnavailable(sessionId, info === null)
  },
  setCliAvailable: (cliAvailable) => set({ cliAvailable }),
  setBusy: (sessionId, busy) =>
    set((state) => ({ busy: { ...state.busy, [sessionId]: busy } })),
  enqueueQueuedMessage: (sessionId, message) =>
    set((state) => ({
      queuedMessages: {
        ...state.queuedMessages,
        [sessionId]: [...(state.queuedMessages[sessionId] || []), message]
      }
    })),
  removeQueuedMessage: (sessionId, id) =>
    set((state) => ({
      queuedMessages: {
        ...state.queuedMessages,
        [sessionId]: (state.queuedMessages[sessionId] || []).filter((m) => m.id !== id)
      }
    })),
  shiftQueuedMessage: (sessionId) => {
    const first = (get().queuedMessages[sessionId] || [])[0]
    if (!first) return undefined
    set((state) => ({
      queuedMessages: {
        ...state.queuedMessages,
        [sessionId]: (state.queuedMessages[sessionId] || []).slice(1)
      }
    }))
    return first
  },
  clearQueuedMessages: (sessionId) =>
    set((state) => ({ queuedMessages: { ...state.queuedMessages, [sessionId]: [] } })),
  setCompacting: (sessionId, compacting) =>
    set((state) => ({ compacting: { ...state.compacting, [sessionId]: compacting } })),
  setStats: (sessionId, stats) =>
    set((state) => ({ stats: { ...state.stats, [sessionId]: stats } })),
  setPinnedSessionIds: (pinnedSessionIds) => set({ pinnedSessionIds }),
  togglePinSession: (sessionId) =>
    set((state) => {
      const pinnedSessionIds = state.pinnedSessionIds.includes(sessionId)
        ? state.pinnedSessionIds.filter((id) => id !== sessionId)
        : [...state.pinnedSessionIds, sessionId]
      window.electronAPI.setStore('pinnedSessionIds', pinnedSessionIds)
      return { pinnedSessionIds }
    }),
  setArchivedSessionIds: (archivedSessionIds) => set({ archivedSessionIds }),
  setSessionArchived: (sessionId, archived) =>
    set((state) => {
      const archivedSessionIds = archived
        ? [...state.archivedSessionIds.filter((id) => id !== sessionId), sessionId]
        : state.archivedSessionIds.filter((id) => id !== sessionId)
      window.electronAPI.setStore('archivedSessionIds', archivedSessionIds)
      return { archivedSessionIds }
    }),
  markSessionUnread: (sessionId) =>
    set((state) => ({ unreadSessionIds: { ...state.unreadSessionIds, [sessionId]: true } })),
  clearSessionUnread: (sessionId) =>
    set((state) => ({ unreadSessionIds: { ...state.unreadSessionIds, [sessionId]: false } })),
  setComposerPrefill: (composerPrefill) => set({ composerPrefill }),
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
      const wasBusy = Boolean(get().busy[event.sessionId])
      const working = event.status === 'working'
      set((state) => ({ busy: { ...state.busy, [event.sessionId]: working } }))
      // working→idle with a non-empty queue: send the next queued message.
      // The wasBusy guard plus the optimistic busy=true below keep a stray or
      // repeated 'idle' from draining more than one message per real turn.
      if (!working && wasBusy) {
        const next = get().shiftQueuedMessage(event.sessionId)
        if (next) {
          get().addMessage(event.sessionId, {
            id: crypto.randomUUID(),
            role: 'user',
            content: next.text
          })
          set((state) => ({ busy: { ...state.busy, [event.sessionId]: true } }))
          void window.electronAPI
            .sendMessage(event.sessionId, next.text, next.images)
            .then((sent) => {
              if (sent) {
                const list = get().messages[event.sessionId] || []
                void get().createCheckpointForMessage(event.sessionId, list.length - 1, next.text)
              }
            })
        } else if (event.sessionId !== get().currentSessionId) {
          // Turn finished in a background session — flag it unread
          get().markSessionUnread(event.sessionId)
        }
      }
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
        uiRequests: { ...state.uiRequests, [event.sessionId]: [] },
        queuedMessages: { ...state.queuedMessages, [event.sessionId]: [] }
      }))
    }
  }
}))
