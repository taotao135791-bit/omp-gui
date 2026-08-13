import { create } from 'zustand'
import { Session, SessionEvent, SessionRuntimeState, SessionStats, PackageInfo, InstallStatus, Language, ModelConfig, PiModel, PromptImage, HistorySessionInfo, RuntimeOverview, RuntimeModelInfo, LoginState, LoginAnswer, SessionThinkingLevel } from '@shared/types'
import { applyToolResult, ToolCallRecord } from '../lib/toolCalls'
import { captureSessionSnapshot } from '../lib/runtimeSnapshot'

export interface MessageLike {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  /** system messages only: 'info' renders neutral instead of the error style. */
  variant?: 'info'
  /** Assistant thinking text, streamed via thinking deltas (collapsible block). */
  thinking?: string
  /** First thinking delta of this message; elapsed time renders from these. */
  thinkingStartTs?: number
  /** Thinking end (first text delta / tool call / turn end); unset while streaming. */
  thinkingEndTs?: number
  /** Images the user attached to this message (in-memory only, dataURL-grade). */
  images?: { data: string; mimeType: string }[]
  toolCall?: ToolCallRecord
  /**
   * Per-turn runtime snapshot: the actual `provider/id` model selector the
   * session was using when this user turn was dispatched. Historical turns
   * are self-describing — never re-derived from the session's current state.
   */
  runtimeModel?: string
  /** Per-turn runtime snapshot: session thinking level at dispatch. */
  runtimeThinking?: string
}

/** Verb buckets the turn-progress row aggregates tool calls into. */
export type TurnVerb = 'read' | 'search' | 'run' | 'edit' | 'call'

export interface TurnCounts {
  /** read/ls calls */
  filesRead: number
  /** grep/find calls */
  searches: number
  /** bash calls */
  commands: number
  /** edit/write calls */
  edits: number
  /** every other tool */
  toolCalls: number
}

/** Live per-turn progress, reset on agent_start and frozen into a summary on agent_end. */
export interface TurnActivity {
  /** agent_start timestamp; the summary's elapsed time derives from it. */
  startedAt: number
  counts: TurnCounts
  lastAction?: { verb: TurnVerb; target: string }
}

/** Frozen counters of the last finished turn of a session. */
export interface TurnSummary {
  elapsedMs: number
  counts: TurnCounts
}

export function emptyTurnCounts(): TurnCounts {
  return { filesRead: 0, searches: 0, commands: 0, edits: 0, toolCalls: 0 }
}

/** Bucket a tool name into its turn-progress verb. */
export function classifyTool(tool: string): TurnVerb {
  const name = tool.toLowerCase()
  if (name === 'read' || name === 'ls') return 'read'
  if (name === 'grep' || name === 'find') return 'search'
  if (name === 'bash') return 'run'
  if (name === 'edit' || name === 'write') return 'edit'
  return 'call'
}

function countField(verb: TurnVerb): keyof TurnCounts {
  switch (verb) {
    case 'read':
      return 'filesRead'
    case 'search':
      return 'searches'
    case 'run':
      return 'commands'
    case 'edit':
      return 'edits'
    default:
      return 'toolCalls'
  }
}

/**
 * Session status → busy mapping. 'waiting_for_user'/'aborting' keep the turn
 * open, so they stay busy; statuses missing from the map leave busy untouched,
 * so a newer main-process state can't wedge the renderer into a wrong one.
 */
const STATUS_BUSY: Partial<Record<SessionRuntimeState, boolean>> = {
  working: true,
  waiting_for_user: true,
  aborting: true,
  idle: false,
  failed: false
}

/**
 * Short label of what a tool call acts on, for the live turn row:
 * bash → first command line (40 chars), file/search tools → path/pattern,
 * everything else → the tool name.
 */
function toolTarget(tool: string, input: unknown): string {
  const name = tool.toLowerCase()
  if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>
    if (name === 'bash' && typeof obj.command === 'string') {
      return obj.command.split('\n', 1)[0].slice(0, 40)
    }
    const target = obj.path ?? obj.pattern ?? obj.query
    if (typeof target === 'string' && target) return target
  }
  return tool
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
  /** sessionId -> live turn-progress counters (present while a turn runs) */
  turnActivity: Record<string, TurnActivity>
  /** sessionId -> frozen counters of the last finished turn */
  turnSummaries: Record<string, TurnSummary>
  /** Sidebar: pinned sessions, listed first (persisted in electron-store). */
  pinnedSessionIds: string[]
  /** Sidebar: archived sessions, folded into the archive group (persisted). */
  archivedSessionIds: string[]
  /** sessionId -> finished a turn while not selected; cleared on select. In-memory only. */
  unreadSessionIds: Record<string, boolean>
  /** One-shot composer prefill (e.g. "build your own plugin" from the packages page). */
  composerPrefill: string | null
  /** Sidebar: recent project folders, MRU first (persisted in electron-store). */
  recentProjects: string[]
  /** Persisted session files of the current project (pi history), newest first. */
  historySessions: HistorySessionInfo[]
  /** Runtime-reported settings overview (profile/capabilities/providers/defaults). */
  runtimeOverview: RuntimeOverview | null
  /** Runtime model catalog (current profile; legacy rides `models`). */
  runtimeModels: RuntimeModelInfo[]
  /** sessionId -> runtime-resolved thinking level (thinking_level_changed events). */
  sessionThinking: Record<string, string | undefined>
  /** sessionId -> bumped on model_changed; pickers refetch get_state. */
  sessionModelVersion: Record<string, number>
  /** Native login flow state (idle when no flow runs). */
  loginState: LoginState
  setTheme: (theme: 'dark' | 'light') => void
  setLanguage: (language: Language) => void
  setCurrentProject: (path: string | null) => void
  setSessions: (sessions: Session[]) => void
  addSession: (session: Session) => void
  setCurrentSessionId: (id: string | null) => void
  addMessage: (sessionId: string, message: MessageLike) => void
  /** Replace a session's whole transcript (history resume backfill). */
  setMessages: (sessionId: string, messages: MessageLike[]) => void
  appendMessageContent: (sessionId: string, content: string) => void
  /** Append a thinking delta to the in-flight assistant message. */
  appendThinking: (sessionId: string, delta: string) => void
  /** Stamp thinkingEndTs on the session's last message if its thinking is open. */
  finalizeThinking: (sessionId: string) => void
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
  /** Replace the recent-projects list (startup load; does not persist). */
  setRecentProjects: (paths: string[]) => void
  /** Drop one path from the recent-projects list and persist the new list. */
  removeRecentProject: (path: string) => void
  /** (Re)load the persisted session history of a project; null clears the list. */
  loadHistorySessions: (projectDir: string | null) => Promise<void>
  /** Drop one entry from the history list (after its file was deleted). */
  removeHistorySession: (filePath: string) => void
  /** Update one session's display title in place. */
  setSessionTitle: (sessionId: string, title: string) => void
  setSessionFile: (sessionId: string, sessionFile: string) => void
  /**
   * Auto-name a session from its first user message when it still carries the
   * default title (project dir basename). No-op once the session has a real
   * name or more than one user message.
   */
  maybeNameSession: (sessionId: string, text: string) => Promise<void>
  setSetupComplete: (complete: boolean) => void
  setInstallStatus: (status: InstallStatus) => void
  /** (Re)load model config + available models from the main process. */
  loadModelState: () => Promise<void>
  /**
   * Hot-switch the CURRENT session's model — session scope only. Never
   * touches the default for future sessions (that lives in Settings).
   */
  setCurrentSessionModel: (provider: string, modelId: string) => Promise<boolean>
  /** Hot-switch the CURRENT session's thinking level — session scope only. */
  setCurrentSessionThinking: (level: SessionThinkingLevel) => Promise<boolean>
  /** Model selector for the NEXT session's spawn args (''/null = runtime default). */
  pendingModel: string | null
  /** Thinking level for the NEXT session's spawn args (null = runtime default). */
  pendingThinking: SessionThinkingLevel | null
  /** Set the next-session model override (composer pickers without a session). */
  setPendingModel: (selector: string | null) => void
  /** Set the next-session thinking override. */
  setPendingThinking: (level: SessionThinkingLevel | null) => void
  /** Read and clear the next-session overrides (session creation funnel). */
  consumeSessionOverrides: () => { modelSelector?: string; thinkingLevel?: SessionThinkingLevel }
  /** Refresh the runtime settings overview (profile/capabilities/providers). */
  loadRuntimeOverview: (force?: boolean) => Promise<void>
  /** Refresh the runtime model catalog (current profile). */
  loadRuntimeModels: () => Promise<void>
  /** Persist the runtime default model (current profile; '' = runtime default). */
  selectRuntimeDefaultModel: (selector: string) => Promise<{ ok: boolean; error?: string }>
  /** Persist the runtime default thinking level (current profile). */
  setRuntimeDefaultThinking: (level: string) => Promise<{ ok: boolean; error?: string }>
  /** Toggle machine skills via the runtime config (current profile). */
  setRuntimeMachineSkills: (enabled: boolean) => Promise<{ ok: boolean; error?: string }>
  /** Set a provider's API key directly (paste-key form, provider-validated). */
  setRuntimeApiKey: (providerId: string, key: string) => Promise<{ ok: boolean; error?: string }>
  /** Start the native login flow for a provider. */
  startLogin: (providerId: string) => Promise<{ ok: boolean; error?: string }>
  /** Answer the pending login prompt. */
  answerLogin: (answer: LoginAnswer) => Promise<void>
  /** Cancel the running login flow. */
  cancelLogin: () => Promise<void>
  /** Open a login URL the runtime asked for (explicit user action). */
  openLoginUrl: (url: string) => Promise<void>
  /** Remove a provider credential via the runtime. */
  logoutProvider: (providerId: string) => Promise<{ ok: boolean; error?: string }>
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
  turnActivity: {},
  turnSummaries: {},
  pinnedSessionIds: [],
  archivedSessionIds: [],
  unreadSessionIds: {},
  composerPrefill: null,
  recentProjects: [],
  historySessions: [],
  runtimeOverview: null,
  runtimeModels: [],
  sessionThinking: {},
  sessionModelVersion: {},
  loginState: { status: 'idle' },
  pendingModel: null,
  pendingThinking: null,

  setTheme: (theme) => {
    set({ theme })
    document.documentElement.classList.toggle('dark', theme === 'dark')
  },
  setLanguage: (language) => {
    set({ language })
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
    window.electronAPI.setStore('language', language)
  },
  setCurrentProject: (currentProject) =>
    set((state) => {
      if (!currentProject) return { currentProject }
      // Keep the MRU recent-projects list in sync (dedup, cap 10, persisted)
      const recentProjects = [
        currentProject,
        ...state.recentProjects.filter((p) => p !== currentProject)
      ].slice(0, 10)
      const changed =
        recentProjects.length !== state.recentProjects.length ||
        recentProjects.some((p, i) => p !== state.recentProjects[i])
      if (changed) window.electronAPI.setStore('recentProjects', recentProjects)
      return { currentProject, recentProjects }
    }),
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
  addSession: (session) => {
    set((state) => ({
      sessions: [session, ...state.sessions],
      currentSessionId: session.id
    }))
    // Backfill the on-disk session file so the history list can dedup it
    // (resumed sessions already carry resumeFrom).
    if (!session.resumeFrom && !session.sessionFile) {
      window.electronAPI.getSessionState(session.id).then((st) => {
        if (st?.sessionFile) get().setSessionFile(session.id, st.sessionFile)
      })
    }
  },
  setSessionFile: (sessionId, sessionFile) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, sessionFile } : s))
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
  setMessages: (sessionId, messages) =>
    set((state) => ({ messages: { ...state.messages, [sessionId]: messages } })),
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
    updated[updated.length - 1] = {
      ...last,
      content: last.content + content,
      // The first text delta after a thinking run closes it (for the elapsed time)
      ...(last.thinking && last.thinkingEndTs === undefined
        ? { thinkingEndTs: Date.now() }
        : {})
    }
    return { messages: { ...state.messages, [sessionId]: updated } }
  }),
  appendThinking: (sessionId, delta) =>
    set((state) => {
      const list = state.messages[sessionId] || []
      const now = Date.now()
      const last = list[list.length - 1]
      // Thinking streams before its message's text; once text started (or the
      // previous thinking run closed), a fresh message carries the new run.
      if (last && last.role === 'assistant' && !last.toolCall && !last.content && last.thinkingEndTs === undefined) {
        const updated = [...list]
        updated[updated.length - 1] = {
          ...last,
          thinking: (last.thinking ?? '') + delta,
          thinkingStartTs: last.thinkingStartTs ?? now
        }
        return { messages: { ...state.messages, [sessionId]: updated } }
      }
      return {
        messages: {
          ...state.messages,
          [sessionId]: [
            ...list,
            {
              id: crypto.randomUUID(),
              role: 'assistant' as const,
              content: '',
              thinking: delta,
              thinkingStartTs: now
            }
          ]
        }
      }
    }),
  finalizeThinking: (sessionId) =>
    set((state) => {
      const list = state.messages[sessionId] || []
      const last = list[list.length - 1]
      if (!last || last.role !== 'assistant' || last.toolCall) return state
      if (!last.thinking || last.thinkingEndTs !== undefined) return state
      const updated = [...list]
      updated[updated.length - 1] = { ...last, thinkingEndTs: Date.now() }
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
  setRecentProjects: (recentProjects) => set({ recentProjects }),
  removeRecentProject: (path) =>
    set((state) => {
      const recentProjects = state.recentProjects.filter((p) => p !== path)
      window.electronAPI.setStore('recentProjects', recentProjects)
      return { recentProjects }
    }),
  loadHistorySessions: async (projectDir) => {
    if (!projectDir) {
      set({ historySessions: [] })
      return
    }
    const list = await window.electronAPI.listSessionHistory(projectDir)
    // Ignore a stale response when the project was switched meanwhile
    if (get().currentProject === projectDir) set({ historySessions: list })
  },
  removeHistorySession: (filePath) =>
    set((state) => ({
      historySessions: state.historySessions.filter((h) => h.filePath !== filePath)
    })),
  setSessionTitle: (sessionId, title) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, title } : s))
    })),
  maybeNameSession: async (sessionId, text) => {
    const state = get()
    const session = state.sessions.find((s) => s.id === sessionId)
    if (!session) return
    const projectName = session.cwd.split('/').filter(Boolean).pop() || ''
    if (session.title.trim() && session.title !== projectName) return
    const list = state.messages[sessionId] || []
    if (list.filter((m) => m.role === 'user').length !== 1) return
    const name = text.replace(/\s+/g, ' ').trim().slice(0, 24)
    if (!name) return
    const ok = await window.electronAPI.setSessionName(sessionId, name)
    if (ok) get().setSessionTitle(sessionId, name)
  },
  setSetupComplete: (setupComplete) => {
    set({ setupComplete })
    window.electronAPI.setStore('setupComplete', setupComplete)
  },
  setInstallStatus: (installStatus) => set({ installStatus }),

  loadRuntimeOverview: async (force = false) => {
    const runtimeOverview = await window.electronAPI.runtimeOverview(force)
    set({ runtimeOverview })
  },

  loadRuntimeModels: async () => {
    const runtimeModels = await window.electronAPI.runtimeListModels()
    set({ runtimeModels })
  },

  selectRuntimeDefaultModel: async (selector) => {
    const result = await window.electronAPI.runtimeSetDefaultModel(selector)
    await get().loadRuntimeOverview(true)
    return result
  },

  setRuntimeDefaultThinking: async (level) => {
    const result = await window.electronAPI.runtimeSetDefaultThinking(level)
    await get().loadRuntimeOverview(true)
    return result
  },

  setRuntimeMachineSkills: async (enabled) => {
    const result = await window.electronAPI.runtimeSetMachineSkills(enabled)
    await get().loadRuntimeOverview(true)
    return result
  },

  setRuntimeApiKey: async (providerId, key) => {
    const result = await window.electronAPI.authSetApiKey(providerId, key)
    await get().loadRuntimeOverview(true)
    return result
  },

  startLogin: async (providerId) => {
    return window.electronAPI.authStartLogin(providerId)
  },

  answerLogin: async (answer) => {
    await window.electronAPI.authAnswerLogin(answer)
  },

  cancelLogin: async () => {
    await window.electronAPI.authCancelLogin()
  },

  openLoginUrl: async (url) => {
    await window.electronAPI.authOpenLoginUrl(url)
  },

  logoutProvider: async (providerId) => {
    const result = await window.electronAPI.authLogout(providerId)
    await get().loadRuntimeOverview(true)
    return result
  },

  loadModelState: async () => {
    const [modelConfig, models] = await Promise.all([
      window.electronAPI.getModelConfig(),
      window.electronAPI.listModels()
    ])
    set({ modelConfig, models })
  },

  setCurrentSessionModel: async (provider, modelId) => {
    const sid = get().currentSessionId
    if (!sid || !provider || !modelId) return false
    return window.electronAPI.setSessionModel(sid, provider, modelId)
  },

  setCurrentSessionThinking: async (level) => {
    const sid = get().currentSessionId
    if (!sid) return false
    return window.electronAPI.setThinkingLevel(sid, level)
  },

  setPendingModel: (selector) => set({ pendingModel: selector }),

  setPendingThinking: (level) => set({ pendingThinking: level }),

  consumeSessionOverrides: () => {
    const { pendingModel, pendingThinking } = get()
    if (pendingModel || pendingThinking) {
      set({ pendingModel: null, pendingThinking: null })
    }
    return {
      ...(pendingModel ? { modelSelector: pendingModel } : {}),
      ...(pendingThinking ? { thinkingLevel: pendingThinking } : {})
    }
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
    } else if (event.type === 'thinking') {
      get().appendThinking(event.sessionId, event.delta)
    } else if (event.type === 'tool_call') {
      // A tool call ends any open thinking run of the previous message
      get().finalizeThinking(event.sessionId)
      get().addMessage(event.sessionId, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        toolCall: {
          id: event.id,
          tool: event.tool,
          input: event.input,
          output: event.output
        }
      })
      // Turn-progress aggregation: bucket the tool and remember the last action
      const verb = classifyTool(event.tool)
      const field = countField(verb)
      const target = toolTarget(event.tool, event.input)
      set((state) => {
        const activity = state.turnActivity[event.sessionId] ?? {
          startedAt: Date.now(),
          counts: emptyTurnCounts()
        }
        return {
          turnActivity: {
            ...state.turnActivity,
            [event.sessionId]: {
              ...activity,
              counts: { ...activity.counts, [field]: activity.counts[field] + 1 },
              lastAction: { verb, target }
            }
          }
        }
      })
    } else if (event.type === 'tool_result') {
      // Merge the result into its tool-call card: by toolCallId when the event
      // carries one (parallel calls pair by id, order-independent); the legacy
      // name+recency fallback inside applyToolResult covers id-less events.
      set((state) => ({
        messages: {
          ...state.messages,
          [event.sessionId]: applyToolResult(state.messages[event.sessionId] || [], event)
        }
      }))
    } else if (event.type === 'status') {
      const wasBusy = Boolean(get().busy[event.sessionId])
      const nextBusy = STATUS_BUSY[event.status]
      if (event.status === 'working') {
        // agent_start: fresh turn-progress counters
        set((state) => ({
          busy: { ...state.busy, [event.sessionId]: true },
          turnActivity: {
            ...state.turnActivity,
            [event.sessionId]: { startedAt: Date.now(), counts: emptyTurnCounts() }
          }
        }))
      } else if (nextBusy === true) {
        // waiting_for_user / aborting: the turn is still open — stay busy.
        set((state) => ({ busy: { ...state.busy, [event.sessionId]: true } }))
      } else if (nextBusy === false) {
        // Turn ended: close any open thinking run and clear busy. idle
        // (agent_end) also freezes the turn summary; a failed session stops
        // there — its error event already put the message on screen and its
        // queue stays parked instead of auto-firing into a dead session.
        get().finalizeThinking(event.sessionId)
        set((state) => {
          const activity = state.turnActivity[event.sessionId]
          const turnActivity = { ...state.turnActivity }
          delete turnActivity[event.sessionId]
          return {
            busy: { ...state.busy, [event.sessionId]: false },
            turnActivity,
            ...(event.status === 'idle' && activity
              ? {
                  turnSummaries: {
                    ...state.turnSummaries,
                    [event.sessionId]: {
                      elapsedMs: Date.now() - activity.startedAt,
                      counts: activity.counts
                    }
                  }
                }
              : {})
          }
        })
      }
      // Statuses outside STATUS_BUSY leave busy/turn state untouched.
      // working→idle with a non-empty queue: send the next queued message.
      // The wasBusy guard plus the optimistic busy=true below keep a stray or
      // repeated 'idle' from draining more than one message per real turn.
      if (event.status === 'idle' && wasBusy) {
        const next = get().shiftQueuedMessage(event.sessionId)
        if (next) {
          // Snapshot the ACTUAL dispatch-time session state, so a queued turn
          // is tagged with the model/thinking it really runs under — even if
          // the user hot-switched the session model while it was queued.
          void captureSessionSnapshot(event.sessionId).then((snap) => {
            get().addMessage(event.sessionId, {
              id: crypto.randomUUID(),
              role: 'user',
              content: next.text,
              images: next.images?.map(({ data, mimeType }) => ({ data, mimeType })),
              runtimeModel: snap.modelSelector,
              runtimeThinking: snap.thinkingLevel
            })
            set((state) => ({ busy: { ...state.busy, [event.sessionId]: true } }))
            void window.electronAPI
              .sendMessage(event.sessionId, next.text, next.images)
              .then((sent) => {
                if (sent) {
                  const list = get().messages[event.sessionId] || []
                  void get().createCheckpointForMessage(event.sessionId, list.length - 1, next.text)
                  void get().maybeNameSession(event.sessionId, next.text)
                }
              })
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
    } else if (event.type === 'ui_cancel') {
      // The extension dismissed its own dialog — drop the pending request.
      set((state) => ({
        uiRequests: {
          ...state.uiRequests,
          [event.sessionId]: (state.uiRequests[event.sessionId] || []).filter(
            (r) => r.id !== event.id
          )
        }
      }))
    } else if (event.type === 'thinking_level_changed') {
      // Runtime-resolved level (may be clamped from the requested one);
      // pickers display exactly this, never the optimistic request.
      set((state) => ({
        sessionThinking: { ...state.sessionThinking, [event.sessionId]: event.level }
      }))
    } else if (event.type === 'model_changed') {
      // Session model changed; pickers refetch get_state for details.
      set((state) => ({
        sessionModelVersion: {
          ...state.sessionModelVersion,
          [event.sessionId]: (state.sessionModelVersion[event.sessionId] ?? 0) + 1
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
      set((state) => {
        const turnActivity = { ...state.turnActivity }
        delete turnActivity[event.sessionId]
        return {
          busy: { ...state.busy, [event.sessionId]: false },
          compacting: { ...state.compacting, [event.sessionId]: false },
          uiRequests: { ...state.uiRequests, [event.sessionId]: [] },
          queuedMessages: { ...state.queuedMessages, [event.sessionId]: [] },
          turnActivity
        }
      })
    }
  }
}))
