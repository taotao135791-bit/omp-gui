import { contextBridge, ipcRenderer, webUtils, IpcRendererEvent } from 'electron'
import { IPC_CHANNELS } from '../shared/constants'
import {
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
  ThinkingLevel,
  SelectImageResult,
  UpdaterStatus
} from '../shared/types'

export interface ElectronAPI {
  detectCli: (force?: boolean) => Promise<CliInfo>
  listSessions: () => Promise<Session[]>
  createSession: (cwd: string) => Promise<Session>
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
  setThinkingLevel: (sessionId: string, level: ThinkingLevel) => Promise<boolean>
  /** Export the session transcript as HTML; resolves the saved path (null on failure). */
  exportHtml: (sessionId: string, outputPath?: string) => Promise<string | null>
  /** Live RPC get_state snapshot of a session; null when unavailable. */
  getSessionState: (sessionId: string) => Promise<SessionState | null>
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
}

const api: ElectronAPI = {
  detectCli: (force?: boolean) => ipcRenderer.invoke(IPC_CHANNELS.OMP_DETECT, force),
  listSessions: () => ipcRenderer.invoke(IPC_CHANNELS.OMP_LIST_SESSIONS),
  createSession: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.OMP_CREATE_SESSION, cwd),
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
  setThinkingLevel: (sessionId: string, level: ThinkingLevel) =>
    ipcRenderer.invoke(IPC_CHANNELS.OMP_SET_THINKING, sessionId, level),
  exportHtml: (sessionId: string, outputPath?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OMP_EXPORT_HTML, sessionId, outputPath),
  getSessionState: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OMP_SESSION_STATE, sessionId),
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
  getPathForFile: (file: File) => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('electronAPI', api)
