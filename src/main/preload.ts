import { contextBridge, ipcRenderer, webUtils, IpcRendererEvent } from 'electron'
import { IPC_CHANNELS } from '../shared/constants'
import {
  CliCapabilities,
  CliInfo,
  Session,
  SessionEvent,
  SessionStats,
  SlashCommand,
  PackageInfo,
  PackageActionResult,
  AppSettings,
  InstallStatus,
  ReadFileResult,
  ExtensionUiAnswer,
  ModelConfig,
  PiModel,
  CommunityPackageInfo,
  CheckpointInfo,
  GitInfo,
  PromptImage,
  SessionState,
  StreamingBehavior,
  SessionThinkingLevel,
  PermissionMode,
  SelectImageResult,
  UpdaterStatus,
  ChatMessage,
  HistorySessionInfo,
  RuntimeOverview,
  RuntimeModelInfo,
  LoginState,
  LoginAnswer
} from '../shared/types'

export interface ElectronAPI {
  detectCli: (force?: boolean) => Promise<CliInfo>
  /** CLI version + RPC feature surface of the detected CLI. */
  getCapabilities: () => Promise<CliCapabilities>
  listSessions: () => Promise<Session[]>
  /** Create a session; overrides are one-shot spawn args for this session only. */
  createSession: (
    cwd: string,
    overrides?: { modelSelector?: string; thinkingLevel?: SessionThinkingLevel }
  ) => Promise<Session>
  sendMessage: (
    sessionId: string,
    text: string,
    images?: PromptImage[],
    streamingBehavior?: StreamingBehavior
  ) => Promise<boolean>
  killSession: (sessionId: string) => Promise<boolean>
  abortSession: (sessionId: string) => Promise<boolean>
  onSessionEvent: (callback: (event: SessionEvent) => void) => () => void
  installOmp: () => Promise<boolean>
  onInstallStatus: (callback: (status: InstallStatus) => void) => () => void
  setFsRoot: (root: string) => Promise<boolean>
  listDir: (dirPath: string) => Promise<{ name: string; isDirectory: boolean; path: string }[]>
  readFile: (filePath: string) => Promise<ReadFileResult>
  /** Flat relative-path file list of a project, for the composer's @ menu. */
  listProjectFiles: (projectDir: string) => Promise<string[]>
  listPackages: () => Promise<PackageInfo[]>
  /** Search the npm registry for community pi packages (keyword pi-package). */
  searchPackages: (query: string, curatedOnly?: boolean) => Promise<CommunityPackageInfo[]>
  installPackage: (source: string) => Promise<PackageActionResult>
  removePackage: (source: string) => Promise<PackageActionResult>
  updatePackage: (source: string) => Promise<PackageActionResult>
  setPackageEnabled: (source: string, enabled: boolean) => Promise<PackageActionResult>
  getStore: <K extends keyof AppSettings>(key: K) => Promise<AppSettings[K]>
  setStore: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<boolean>
  selectFolder: () => Promise<string | null>
  selectFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>
  /** Pick an image file; resolves its base64 bytes (null when cancelled). */
  selectImage: () => Promise<SelectImageResult>
  showCliSettings: () => Promise<boolean>
  respondUi: (sessionId: string, requestId: string, answer: ExtensionUiAnswer) => Promise<boolean>
  setSessionModel: (sessionId: string, provider: string, modelId: string) => Promise<boolean>
  /** Token/context usage of a session; null when unavailable. */
  getSessionStats: (sessionId: string) => Promise<SessionStats | null>
  /** Slash commands (extensions/prompts/skills) available in a session. */
  listCommands: (sessionId: string) => Promise<SlashCommand[]>
  /** Trigger context compaction for a session. */
  compactSession: (sessionId: string) => Promise<boolean>
  /** Inject a steering message into a running turn. */
  steer: (sessionId: string, message: string, images?: PromptImage[]) => Promise<boolean>
  /** Queue a message delivered after the current turn finishes. */
  followUp: (sessionId: string, message: string, images?: PromptImage[]) => Promise<boolean>
  /** Change the thinking level of a live session. */
  setThinkingLevel: (sessionId: string, level: SessionThinkingLevel) => Promise<boolean>
  /** Rewrite a live session's approval-extension config (permission mode hot-swap). */
  updateApprovalConfig: (sessionId: string, mode: PermissionMode) => Promise<boolean>
  /** Export the session transcript as HTML; resolves the saved path (null on failure). */
  exportHtml: (sessionId: string, outputPath?: string) => Promise<string | null>
  /** Live RPC get_state snapshot of a session; null when unavailable. */
  getSessionState: (sessionId: string) => Promise<SessionState | null>
  /** Persisted sessions of a project (pi session files), newest first. */
  listSessionHistory: (projectDir: string) => Promise<HistorySessionInfo[]>
  /** Resume a persisted session file; returns the live session + transcript. */
  resumeSession: (
    projectDir: string,
    filePath: string
  ) => Promise<{ session: Session; messages: ChatMessage[] } | null>
  /** Delete a persisted session file (guarded to pi's sessions root). */
  deleteSessionFile: (filePath: string) => Promise<boolean>
  /** Set a session's display name (single line, max 60 chars). */
  setSessionName: (sessionId: string, name: string) => Promise<boolean>
  /** Snapshot the session's project as a git checkpoint; null for non-git dirs. */
  checkpointCreate: (
    sessionId: string,
    msgIndex: number,
    promptPreview: string
  ) => Promise<CheckpointInfo | null>
  checkpointList: (sessionId: string) => Promise<CheckpointInfo[]>
  /** Restore the project to a checkpoint; deletes files created after it. */
  checkpointRestore: (id: string) => Promise<PackageActionResult>
  /** Working-tree change summary for the changes panel; null for non-git dirs. */
  gitInfo: (projectDir: string) => Promise<GitInfo | null>
  /** Unified diff of one file (synthetic new-file diff for untracked files). */
  gitFileDiff: (projectDir: string, filePath: string) => Promise<string | null>
  /** Toggle loading of machine-local ~/.agents/skills; returns what changed. */
  setMachineSkills: (enabled: boolean) => Promise<{ enabled: boolean; excluded: string[]; available: string[] }>
  /** Read-only: names of machine-local skills present under ~/.agents/skills. */
  listMachineSkills: () => Promise<string[]>
  getModelConfig: () => Promise<ModelConfig>
  setModelConfig: (patch: Partial<Omit<ModelConfig, 'authProviders'>>) => Promise<PackageActionResult>
  setApiKey: (provider: string, key: string) => Promise<PackageActionResult>
  clearApiKey: (provider: string) => Promise<PackageActionResult>
  listModels: () => Promise<PiModel[]>
  /** pi's full built-in model registry, credentials not required. */
  listCatalogModels: () => Promise<PiModel[]>
  getAppVersion: () => Promise<string>
  /** Current auto-update state. */
  updaterGetStatus: () => Promise<UpdaterStatus>
  /** Manually check for updates; { status: 'dev' } in development. */
  updaterCheck: () => Promise<UpdaterStatus>
  /** Download the available update; progress arrives via onUpdaterStatus. */
  updaterDownload: () => Promise<UpdaterStatus>
  updaterQuitAndInstall: () => Promise<void>
  /** Open the releases page in the browser — manual fallback for unsigned builds. */
  updaterOpenReleasePage: () => Promise<void>
  onUpdaterStatus: (callback: (status: UpdaterStatus) => void) => () => void
  /** Fired when a completion notification is clicked; selects the session. */
  onNotifySelectSession: (callback: (sessionId: string) => void) => () => void
  /** Real filesystem path for a File dropped from Finder (contextIsolation-safe). */
  getPathForFile: (file: File) => string

  // ------------------------------------------------------- runtime settings
  /** Runtime-reported settings overview (profile, providers, capabilities, defaults). */
  runtimeOverview: (force?: boolean) => Promise<RuntimeOverview>
  /** Runtime model catalog (credential-filtered by the runtime). */
  runtimeListModels: () => Promise<RuntimeModelInfo[]>
  /** Set the new-session default model; '' resets to the runtime default. Read-after-write verified. */
  runtimeSetDefaultModel: (selector: string) => Promise<{ ok: boolean; error?: string }>
  /** Set the default thinking level for new sessions. Read-after-write verified. */
  runtimeSetDefaultThinking: (level: string) => Promise<{ ok: boolean; error?: string }>
  /** Toggle machine-local skills via the runtime config (current profile). */
  runtimeSetMachineSkills: (enabled: boolean) => Promise<{ ok: boolean; error?: string }>
  /** Start the runtime's native login flow; progress rides onLoginState. */
  authStartLogin: (providerId: string) => Promise<{ ok: boolean; error?: string }>
  /** Set a provider's API key directly (paste-key form, provider-validated). */
  authSetApiKey: (providerId: string, key: string) => Promise<{ ok: boolean; error?: string }>
  /** Answer the pending login prompt (input/select/confirm, or cancel). */
  authAnswerLogin: (answer: LoginAnswer) => Promise<{ ok: boolean; error?: string }>
  /** Cancel the running login flow (kills the runtime operation). */
  authCancelLogin: () => Promise<{ ok: boolean; error?: string }>
  /** Open a login URL the runtime asked for (explicit user action). */
  authOpenLoginUrl: (url: string) => Promise<{ ok: boolean; error?: string }>
  /** Remove a provider credential via the runtime; read-after-write verified. */
  authLogout: (providerId: string) => Promise<{ ok: boolean; error?: string }>
  /** Login flow state stream. */
  onLoginState: (callback: (state: LoginState) => void) => () => void
}

const api: ElectronAPI = {
  detectCli: (force?: boolean) => ipcRenderer.invoke(IPC_CHANNELS.OMP_DETECT, force),
  getCapabilities: () => ipcRenderer.invoke(IPC_CHANNELS.OMP_CAPABILITIES),
  listSessions: () => ipcRenderer.invoke(IPC_CHANNELS.OMP_LIST_SESSIONS),
  createSession: (cwd: string, overrides?: { modelSelector?: string; thinkingLevel?: SessionThinkingLevel }) =>
    ipcRenderer.invoke(IPC_CHANNELS.OMP_CREATE_SESSION, cwd, overrides),
  sendMessage: (
    sessionId: string,
    text: string,
    images?: PromptImage[],
    streamingBehavior?: StreamingBehavior
  ) => ipcRenderer.invoke(IPC_CHANNELS.OMP_SEND_MESSAGE, sessionId, text, images, streamingBehavior),
  killSession: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.OMP_KILL_SESSION, sessionId),
  abortSession: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OMP_ABORT_SESSION, sessionId),
  onSessionEvent: (callback: (event: SessionEvent) => void) => {
    const handler = (_event: IpcRendererEvent, ev: SessionEvent) => callback(ev)
    ipcRenderer.on(IPC_CHANNELS.OMP_SESSION_EVENT, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.OMP_SESSION_EVENT, handler)
    }
  },
  installOmp: () => ipcRenderer.invoke(IPC_CHANNELS.OMP_INSTALL),
  onInstallStatus: (callback: (status: InstallStatus) => void) => {
    const handler = (_event: IpcRendererEvent, status: InstallStatus) => callback(status)
    ipcRenderer.on(IPC_CHANNELS.OMP_INSTALL_STATUS, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.OMP_INSTALL_STATUS, handler)
    }
  },
  setFsRoot: (root: string) => ipcRenderer.invoke(IPC_CHANNELS.FS_SET_ROOT, root),
  listDir: (dirPath: string) => ipcRenderer.invoke(IPC_CHANNELS.FS_LIST_DIR, dirPath),
  readFile: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.FS_READ_FILE, filePath),
  listProjectFiles: (projectDir: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.FS_LIST_PROJECT_FILES, projectDir),
  listPackages: () => ipcRenderer.invoke(IPC_CHANNELS.PACKAGES_LIST),
  searchPackages: (query: string, curatedOnly?: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.PACKAGES_SEARCH, query, curatedOnly),
  installPackage: (source: string) => ipcRenderer.invoke(IPC_CHANNELS.PACKAGES_INSTALL, source),
  removePackage: (source: string) => ipcRenderer.invoke(IPC_CHANNELS.PACKAGES_REMOVE, source),
  updatePackage: (source: string) => ipcRenderer.invoke(IPC_CHANNELS.PACKAGES_UPDATE, source),
  setPackageEnabled: (source: string, enabled: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.PACKAGES_SET_ENABLED, source, enabled),
  getStore: (key: keyof AppSettings) => ipcRenderer.invoke(IPC_CHANNELS.STORE_GET, key),
  setStore: (key: keyof AppSettings, value: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.STORE_SET, key, value),
  selectFolder: () => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SELECT_FOLDER),
  selectFile: (filters?: { name: string; extensions: string[] }[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SELECT_FILE, filters),
  selectImage: () => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SELECT_IMAGE),
  showCliSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SHELL_SHOW_CLI_SETTINGS),
  respondUi: (sessionId: string, requestId: string, answer: ExtensionUiAnswer) =>
    ipcRenderer.invoke(IPC_CHANNELS.OMP_RESPOND_UI, sessionId, requestId, answer),
  setSessionModel: (sessionId: string, provider: string, modelId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OMP_SET_MODEL, sessionId, provider, modelId),
  getSessionStats: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OMP_SESSION_STATS, sessionId),
  listCommands: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OMP_LIST_COMMANDS, sessionId),
  compactSession: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OMP_COMPACT, sessionId),
  steer: (sessionId: string, message: string, images?: PromptImage[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.OMP_STEER, sessionId, message, images),
  followUp: (sessionId: string, message: string, images?: PromptImage[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.OMP_FOLLOW_UP, sessionId, message, images),
  setThinkingLevel: (sessionId: string, level: SessionThinkingLevel) =>
    ipcRenderer.invoke(IPC_CHANNELS.OMP_SET_THINKING, sessionId, level),
  updateApprovalConfig: (sessionId: string, mode: PermissionMode) =>
    ipcRenderer.invoke(IPC_CHANNELS.OMP_UPDATE_APPROVAL_CONFIG, sessionId, mode),
  exportHtml: (sessionId: string, outputPath?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OMP_EXPORT_HTML, sessionId, outputPath),
  getSessionState: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OMP_SESSION_STATE, sessionId),
  listSessionHistory: (projectDir: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OMP_LIST_SESSION_HISTORY, projectDir),
  resumeSession: (projectDir: string, filePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OMP_RESUME_SESSION, projectDir, filePath),
  deleteSessionFile: (filePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OMP_DELETE_SESSION_FILE, filePath),
  setSessionName: (sessionId: string, name: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OMP_SET_SESSION_NAME, sessionId, name),
  checkpointCreate: (sessionId: string, msgIndex: number, promptPreview: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CHECKPOINT_CREATE, sessionId, msgIndex, promptPreview),
  checkpointList: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CHECKPOINT_LIST, sessionId),
  checkpointRestore: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.CHECKPOINT_RESTORE, id),
  gitInfo: (projectDir: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_INFO, projectDir),
  gitFileDiff: (projectDir: string, filePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GIT_FILE_DIFF, projectDir, filePath),
  setMachineSkills: (enabled: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.PI_SET_MACHINE_SKILLS, enabled),
  listMachineSkills: () => ipcRenderer.invoke(IPC_CHANNELS.PI_LIST_MACHINE_SKILLS),
  getModelConfig: () => ipcRenderer.invoke(IPC_CHANNELS.PI_GET_MODEL_CONFIG),
  setModelConfig: (patch: Partial<Omit<ModelConfig, 'authProviders'>>) =>
    ipcRenderer.invoke(IPC_CHANNELS.PI_SET_MODEL_CONFIG, patch),
  setApiKey: (provider: string, key: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PI_SET_API_KEY, provider, key),
  clearApiKey: (provider: string) => ipcRenderer.invoke(IPC_CHANNELS.PI_CLEAR_API_KEY, provider),
  listModels: () => ipcRenderer.invoke(IPC_CHANNELS.PI_LIST_MODELS),
  listCatalogModels: () => ipcRenderer.invoke(IPC_CHANNELS.PI_LIST_CATALOG_MODELS),
  getAppVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP_VERSION),
  updaterGetStatus: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_GET_STATUS),
  updaterCheck: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_CHECK),
  updaterDownload: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_DOWNLOAD),
  updaterQuitAndInstall: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_QUIT_INSTALL),
  updaterOpenReleasePage: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_OPEN_PAGE),
  onUpdaterStatus: (callback: (status: UpdaterStatus) => void) => {
    const handler = (_event: IpcRendererEvent, status: UpdaterStatus) => callback(status)
    ipcRenderer.on(IPC_CHANNELS.UPDATER_STATUS, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.UPDATER_STATUS, handler)
    }
  },
  onNotifySelectSession: (callback: (sessionId: string) => void) => {
    const handler = (_event: IpcRendererEvent, sessionId: string) => callback(sessionId)
    ipcRenderer.on(IPC_CHANNELS.NOTIFY_SELECT_SESSION, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.NOTIFY_SELECT_SESSION, handler)
    }
  },
  getPathForFile: (file: File) => webUtils.getPathForFile(file),

  runtimeOverview: (force?: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.RUNTIME_OVERVIEW, force),
  runtimeListModels: () => ipcRenderer.invoke(IPC_CHANNELS.RUNTIME_LIST_MODELS),
  runtimeSetDefaultModel: (selector: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.RUNTIME_SET_DEFAULT_MODEL, selector),
  runtimeSetDefaultThinking: (level: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.RUNTIME_SET_DEFAULT_THINKING, level),
  runtimeSetMachineSkills: (enabled: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.RUNTIME_SET_MACHINE_SKILLS, enabled),
  authStartLogin: (providerId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_START_LOGIN, providerId),
  authSetApiKey: (providerId: string, key: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_SET_API_KEY, providerId, key),
  authAnswerLogin: (answer: LoginAnswer) =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_ANSWER_LOGIN, answer),
  authCancelLogin: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_CANCEL_LOGIN),
  authOpenLoginUrl: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.AUTH_OPEN_LOGIN_URL, url),
  authLogout: (providerId: string) => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGOUT, providerId),
  onLoginState: (callback: (state: LoginState) => void) => {
    const handler = (_event: IpcRendererEvent, state: LoginState) => callback(state)
    ipcRenderer.on(IPC_CHANNELS.AUTH_LOGIN_STATE, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.AUTH_LOGIN_STATE, handler)
    }
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)
