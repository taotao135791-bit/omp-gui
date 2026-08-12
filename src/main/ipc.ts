import { ipcMain, dialog, shell, app, BrowserWindow, IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import { IPC_CHANNELS } from '../shared/constants'
import {
  SessionEvent,
  AppSettings,
  InstallStatus,
  ReadFileResult,
  ExtensionUiAnswer,
  ModelConfig,
  CheckpointInfo,
  PermissionMode,
  PromptImage,
  StreamingBehavior,
  ThinkingLevel,
  SelectImageResult,
  LoginAnswer,
  LoginState
} from '../shared/types'
import {
  detectCli,
  invalidateCliCache,
  getCapabilities,
  createSession,
  sendMessage,
  killSession,
  abortSession,
  listSessions,
  getSession,
  respondExtensionUi,
  setSessionModel,
  getSessionStats,
  listSessionCommands,
  compactSession,
  steer,
  followUp,
  setThinkingLevel,
  updateApprovalConfig,
  exportHtml,
  getSessionState,
  setSessionName,
  resumeSession
} from './omp'
import {
  listPackages,
  installPackage,
  removePackage,
  updatePackage,
  setPackageEnabled,
  defaultPiAgentDir
} from './packages'
import { getModelConfig, setModelConfig, setApiKey, clearApiKey, syncMachineSkills, listMachineSkillNames } from './piSettings'
import { listAvailableModels, listCatalogModels, invalidateModelCache } from './piModels'
import { getStore, setStore } from './store'
import { installOmp } from './installer'
import { searchCommunityPackages } from './community'
import { FsGuard } from './fsGuard'
import {
  createCheckpoint,
  restoreCheckpoint,
  saveCheckpoint,
  listCheckpoints,
  getCheckpoint
} from './checkpoints'
import { getGitInfo, getFileDiff } from './gitinfo'
import { listSessionHistory, deleteSessionFile } from './sessionHistory'
import { defaultExportFileName } from './exportPath'
import { listProjectFiles } from './projectFiles'
import { maybeNotifyTurnFinished, maybeNotifyUiRequest } from './notify'
import {
  getUpdaterStatus,
  updaterCheck,
  updaterDownload,
  updaterQuitAndInstall,
  updaterOpenReleasePage
} from './updater'
import { RuntimeSettings, PROVIDER_ID_PATTERN } from './omp/settings/RuntimeSettings'
import { OmpLoginFlow } from './omp/settings/OmpLoginFlow'

const fsGuard = new FsGuard()

/** Runtime-settings facade, rebuilt whenever the CLI detection is invalidated. */
let runtimeSettings = new RuntimeSettings()
let loginFlow: OmpLoginFlow | null = null

function broadcastLoginState(state: LoginState): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC_CHANNELS.AUTH_LOGIN_STATE, state)
  }
}

const MAX_READ_FILE_BYTES = 2 * 1024 * 1024
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp'
}

function broadcastSessionEvent(event: SessionEvent): void {
  const wins = BrowserWindow.getAllWindows()
  for (const win of wins) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.OMP_SESSION_EVENT, event)
    }
  }
  maybeNotifyTurnFinished(event)
  maybeNotifyUiRequest(event)
}

/** Accept only well-formed prompt images from the renderer. */
function sanitizeImages(images: unknown): PromptImage[] | undefined {
  if (!Array.isArray(images)) return undefined
  const out: PromptImage[] = []
  for (const img of images as Partial<PromptImage>[]) {
    if (img && typeof img.data === 'string' && typeof img.mimeType === 'string') {
      out.push({ type: 'image', data: img.data, mimeType: img.mimeType })
    }
  }
  return out.length ? out : undefined
}

function sanitizeStreamingBehavior(value: unknown): StreamingBehavior | undefined {
  return value === 'steer' || value === 'followUp' ? value : undefined
}

/** Dialog filters from the renderer; falls back to the legacy ts/js default. */
function sanitizeDialogFilters(value: unknown): { name: string; extensions: string[] }[] {
  const fallback = [{ name: 'Extensions', extensions: ['ts', 'js'] }]
  if (!Array.isArray(value)) return fallback
  const out: { name: string; extensions: string[] }[] = []
  for (const f of value as Array<Partial<{ name: string; extensions: unknown[] }>>) {
    if (
      f &&
      typeof f.name === 'string' &&
      Array.isArray(f.extensions) &&
      f.extensions.every((e) => typeof e === 'string')
    ) {
      out.push({ name: f.name, extensions: f.extensions as string[] })
    }
  }
  return out.length ? out : fallback
}

const THINKING_LEVELS: ThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

const PERMISSION_MODES: PermissionMode[] = ['full', 'no-bash', 'readonly', 'ask']

export function registerIpc() {
  ipcMain.handle(IPC_CHANNELS.OMP_DETECT, async (_event: IpcMainInvokeEvent, force?: boolean) => {
    if (force) {
      invalidateCliCache()
      // CLI may have changed (install/upgrade): rebuild the runtime-settings
      // facade and drop every cached probe result.
      runtimeSettings = new RuntimeSettings()
    }
    return detectCli()
  })

  // CLI version + RPC feature surface for the settings page.
  ipcMain.handle(IPC_CHANNELS.OMP_CAPABILITIES, async () => {
    return getCapabilities()
  })

  ipcMain.handle(
    IPC_CHANNELS.OMP_LIST_SESSIONS,
    async () => listSessions()
  )

  ipcMain.handle(
    IPC_CHANNELS.OMP_CREATE_SESSION,
    async (_event: IpcMainInvokeEvent, cwd: string) => {
      if (typeof cwd !== 'string' || !cwd.trim()) {
        throw new Error('createSession requires a non-empty cwd')
      }
      const resolved = path.resolve(cwd)
      fsGuard.addRoot(resolved)
      return createSession(resolved, broadcastSessionEvent)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.OMP_SEND_MESSAGE,
    async (
      _event: IpcMainInvokeEvent,
      sessionId: string,
      text: string,
      images?: unknown,
      streamingBehavior?: unknown
    ) => {
      return sendMessage(
        sessionId,
        text,
        sanitizeImages(images),
        sanitizeStreamingBehavior(streamingBehavior)
      )
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.OMP_KILL_SESSION,
    async (_event: IpcMainInvokeEvent, sessionId: string) => {
      return killSession(sessionId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.OMP_ABORT_SESSION,
    async (_event: IpcMainInvokeEvent, sessionId: string) => {
      return abortSession(sessionId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.OMP_RESPOND_UI,
    async (_event: IpcMainInvokeEvent, sessionId: string, requestId: string, answer: ExtensionUiAnswer) => {
      if (typeof requestId !== 'string' || !requestId) return false
      if (
        typeof answer !== 'object' ||
        answer === null ||
        !('cancelled' in answer || 'value' in answer || 'confirmed' in answer)
      ) {
        return false
      }
      return respondExtensionUi(sessionId, requestId, answer)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.OMP_SET_MODEL,
    async (_event: IpcMainInvokeEvent, sessionId: string, provider: string, modelId: string) => {
      if (typeof provider !== 'string' || !provider || typeof modelId !== 'string' || !modelId) {
        return false
      }
      return setSessionModel(sessionId, provider, modelId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.PACKAGES_SEARCH,
    async (_event: IpcMainInvokeEvent, query: unknown, curatedOnly: unknown) => {
      return searchCommunityPackages(typeof query === 'string' ? query : '', curatedOnly === true)
    }
  )

  ipcMain.handle(IPC_CHANNELS.PI_LIST_MODELS, async () => {
    return listAvailableModels()
  })

  ipcMain.handle(
    IPC_CHANNELS.OMP_SESSION_STATS,
    async (_event: IpcMainInvokeEvent, sessionId: string) => {
      if (typeof sessionId !== 'string' || !sessionId) return null
      return getSessionStats(sessionId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.OMP_LIST_COMMANDS,
    async (_event: IpcMainInvokeEvent, sessionId: string) => {
      if (typeof sessionId !== 'string' || !sessionId) return []
      return listSessionCommands(sessionId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.OMP_COMPACT,
    async (_event: IpcMainInvokeEvent, sessionId: string) => {
      if (typeof sessionId !== 'string' || !sessionId) return false
      return compactSession(sessionId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.OMP_STEER,
    async (_event: IpcMainInvokeEvent, sessionId: string, message: string, images?: unknown) => {
      if (typeof sessionId !== 'string' || !sessionId || typeof message !== 'string') return false
      return steer(sessionId, message, sanitizeImages(images))
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.OMP_FOLLOW_UP,
    async (_event: IpcMainInvokeEvent, sessionId: string, message: string, images?: unknown) => {
      if (typeof sessionId !== 'string' || !sessionId || typeof message !== 'string') return false
      return followUp(sessionId, message, sanitizeImages(images))
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.OMP_SET_THINKING,
    async (_event: IpcMainInvokeEvent, sessionId: string, level: ThinkingLevel) => {
      if (typeof sessionId !== 'string' || !sessionId) return false
      if (!THINKING_LEVELS.includes(level)) return false
      return setThinkingLevel(sessionId, level)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.OMP_UPDATE_APPROVAL_CONFIG,
    async (_event: IpcMainInvokeEvent, sessionId: string, mode: PermissionMode) => {
      if (typeof sessionId !== 'string' || !sessionId) return false
      if (!PERMISSION_MODES.includes(mode)) return false
      return updateApprovalConfig(sessionId, mode)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.OMP_EXPORT_HTML,
    async (_event: IpcMainInvokeEvent, sessionId: string, outputPath?: string) => {
      if (typeof sessionId !== 'string' || !sessionId) return null
      const target =
        typeof outputPath === 'string' && outputPath
          ? outputPath
          : path.join(
              app.getPath('downloads'),
              defaultExportFileName(getSession(sessionId)?.title, sessionId)
            )
      const saved = await exportHtml(sessionId, target)
      if (saved) shell.showItemInFolder(saved)
      return saved
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.OMP_SESSION_STATE,
    async (_event: IpcMainInvokeEvent, sessionId: string) => {
      if (typeof sessionId !== 'string' || !sessionId) return null
      return getSessionState(sessionId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.OMP_LIST_SESSION_HISTORY,
    async (_event: IpcMainInvokeEvent, projectDir: string) => {
      if (typeof projectDir !== 'string' || !projectDir.trim()) return []
      return listSessionHistory(path.resolve(projectDir))
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.OMP_RESUME_SESSION,
    async (_event: IpcMainInvokeEvent, projectDir: string, filePath: string) => {
      if (typeof projectDir !== 'string' || !projectDir.trim()) return null
      if (typeof filePath !== 'string' || !filePath.trim()) return null
      const resolved = path.resolve(projectDir)
      fsGuard.addRoot(resolved)
      return resumeSession(resolved, broadcastSessionEvent, filePath)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.OMP_DELETE_SESSION_FILE,
    async (_event: IpcMainInvokeEvent, filePath: string) => {
      if (typeof filePath !== 'string' || !filePath.trim()) return false
      return deleteSessionFile(filePath)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.OMP_SET_SESSION_NAME,
    async (_event: IpcMainInvokeEvent, sessionId: string, name: string) => {
      if (typeof sessionId !== 'string' || !sessionId || typeof name !== 'string') return false
      return setSessionName(sessionId, name)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.CHECKPOINT_CREATE,
    async (_event: IpcMainInvokeEvent, sessionId: string, msgIndex: number, promptPreview: string) => {
      if (typeof sessionId !== 'string' || !sessionId) return null
      const session = getSession(sessionId)
      if (!session) return null
      const snapshot = await createCheckpoint(session.cwd)
      if (!snapshot) return null
      const info: CheckpointInfo = {
        id: crypto.randomUUID(),
        sessionId,
        sha: snapshot.sha,
        untracked: snapshot.untracked,
        promptPreview: typeof promptPreview === 'string' ? promptPreview.slice(0, 80) : '',
        msgIndex: typeof msgIndex === 'number' ? msgIndex : 0,
        createdAt: Date.now()
      }
      saveCheckpoint(info)
      return info
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.CHECKPOINT_LIST,
    async (_event: IpcMainInvokeEvent, sessionId: string) => {
      if (typeof sessionId !== 'string' || !sessionId) return []
      return listCheckpoints(sessionId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.CHECKPOINT_RESTORE,
    async (_event: IpcMainInvokeEvent, id: string) => {
      if (typeof id !== 'string' || !id) return { ok: false, log: 'invalid checkpoint id' }
      const checkpoint = getCheckpoint(id)
      if (!checkpoint) return { ok: false, log: 'Checkpoint not found.' }
      const session = getSession(checkpoint.sessionId)
      if (!session) return { ok: false, log: 'Session is no longer running.' }
      return restoreCheckpoint(session.cwd, checkpoint.sha, checkpoint.untracked)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.GIT_INFO,
    async (_event: IpcMainInvokeEvent, projectDir: string) => {
      if (typeof projectDir !== 'string' || !projectDir.trim()) return null
      return getGitInfo(projectDir)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.GIT_FILE_DIFF,
    async (_event: IpcMainInvokeEvent, projectDir: string, filePath: string) => {
      if (typeof projectDir !== 'string' || !projectDir.trim()) return null
      if (typeof filePath !== 'string' || !filePath.trim()) return null
      return getFileDiff(projectDir, filePath)
    }
  )

  ipcMain.handle(IPC_CHANNELS.UPDATER_GET_STATUS, async () => {
    return getUpdaterStatus()
  })

  ipcMain.handle(IPC_CHANNELS.UPDATER_CHECK, async () => {
    return updaterCheck()
  })

  ipcMain.handle(IPC_CHANNELS.UPDATER_DOWNLOAD, async () => {
    return updaterDownload()
  })

  ipcMain.handle(IPC_CHANNELS.UPDATER_QUIT_INSTALL, async () => {
    updaterQuitAndInstall()
  })

  ipcMain.handle(IPC_CHANNELS.UPDATER_OPEN_PAGE, async () => {
    await updaterOpenReleasePage()
  })

  ipcMain.handle(
    IPC_CHANNELS.PI_SET_MACHINE_SKILLS,
    async (_event: IpcMainInvokeEvent, enabled: boolean) => {
      const on = enabled === true
      setStore('machineSkills', on)
      const excluded = syncMachineSkills(on)
      return { enabled: on, excluded, available: listMachineSkillNames() }
    }
  )

  // Read-only probe: which machine-local skills exist (no writes either way).
  ipcMain.handle(IPC_CHANNELS.PI_LIST_MACHINE_SKILLS, async () => {
    return listMachineSkillNames()
  })

  ipcMain.handle(IPC_CHANNELS.PI_LIST_CATALOG_MODELS, async () => {
    return listCatalogModels()
  })

  ipcMain.handle(IPC_CHANNELS.PI_GET_MODEL_CONFIG, async () => {
    return getModelConfig()
  })

  ipcMain.handle(
    IPC_CHANNELS.PI_SET_MODEL_CONFIG,
    async (_event, patch: Partial<Omit<ModelConfig, 'authProviders'>>) => {
      if (typeof patch !== 'object' || patch === null) {
        return { ok: false, log: 'invalid model config' }
      }
      return setModelConfig(patch)
    }
  )

  ipcMain.handle(IPC_CHANNELS.PI_SET_API_KEY, async (_event, provider: string, key: string) => {
    if (typeof key !== 'string') return { ok: false, log: 'invalid api key' }
    const result = setApiKey(String(provider ?? ''), key)
    if (result.ok) invalidateModelCache()
    return result
  })

  ipcMain.handle(IPC_CHANNELS.PI_CLEAR_API_KEY, async (_event, provider: string) => {
    const result = clearApiKey(String(provider ?? ''))
    if (result.ok) invalidateModelCache()
    return result
  })

  // ------------------------------------------------------- runtime settings
  // Unified runtime settings/auth API — the renderer renders profile +
  // capabilities; all version differences are absorbed in main.

  ipcMain.handle(IPC_CHANNELS.RUNTIME_OVERVIEW, async (_event, force?: boolean) => {
    return runtimeSettings.getOverview(force === true)
  })

  ipcMain.handle(IPC_CHANNELS.RUNTIME_LIST_MODELS, async () => {
    return runtimeSettings.listModels()
  })

  ipcMain.handle(
    IPC_CHANNELS.RUNTIME_SET_DEFAULT_MODEL,
    async (_event, selector: unknown) => {
      if (
        typeof selector !== 'string' ||
        (selector !== '' && !/^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9._-]*$/i.test(selector))
      ) {
        return { ok: false, error: 'invalid model selector' }
      }
      return runtimeSettings.setDefaultModel(selector)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.RUNTIME_SET_DEFAULT_THINKING,
    async (_event, level: unknown) => {
      if (typeof level !== 'string' || (level !== '' && !THINKING_LEVELS.includes(level as ThinkingLevel))) {
        return { ok: false, error: 'invalid thinking level' }
      }
      return runtimeSettings.setDefaultThinking(level)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.RUNTIME_SET_MACHINE_SKILLS,
    async (_event, enabled: unknown) => {
      return runtimeSettings.setMachineSkills(enabled === true)
    }
  )

  ipcMain.handle(IPC_CHANNELS.AUTH_START_LOGIN, async (_event, providerId: unknown) => {
    if (typeof providerId !== 'string' || !PROVIDER_ID_PATTERN.test(providerId)) {
      return { ok: false, error: 'invalid provider id' }
    }
    if (loginFlow?.active) {
      return { ok: false, error: 'a login flow is already running' }
    }
    const cli = detectCli()
    const flow = new OmpLoginFlow({
      cli,
      onState: broadcastLoginState,
      onOpenUrl: (url) => {
        // Login URLs come from the runtime's own login flow; https only
        // (loopback launch URLs included — they 302 to the https target).
        if (/^https:\/\//i.test(url) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(url)) {
          void shell.openExternal(url)
        }
      }
    })
    loginFlow = flow
    // Fire-and-forget: progress rides the AUTH_LOGIN_STATE channel.
    void flow.start(providerId).finally(() => {
      runtimeSettings.invalidate()
      if (loginFlow === flow) loginFlow = null
    })
    return { ok: true }
  })

  ipcMain.handle(IPC_CHANNELS.AUTH_ANSWER_LOGIN, async (_event, answer: LoginAnswer) => {
    if (!loginFlow?.active) return { ok: false, error: 'no active login flow' }
    if (
      typeof answer !== 'object' ||
      answer === null ||
      !('cancelled' in answer || 'value' in answer || 'confirmed' in answer)
    ) {
      return { ok: false, error: 'invalid answer' }
    }
    if ('value' in answer && typeof answer.value !== 'string') {
      return { ok: false, error: 'invalid answer' }
    }
    return { ok: loginFlow.answer(answer) }
  })

  ipcMain.handle(IPC_CHANNELS.AUTH_CANCEL_LOGIN, async () => {
    loginFlow?.cancel()
    return { ok: true }
  })

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async (_event, providerId: unknown) => {
    if (typeof providerId !== 'string' || !PROVIDER_ID_PATTERN.test(providerId)) {
      return { ok: false, error: 'invalid provider id' }
    }
    return runtimeSettings.logout(providerId)
  })

  ipcMain.handle(IPC_CHANNELS.APP_VERSION, async () => {
    return app.getVersion()
  })

  ipcMain.handle(IPC_CHANNELS.OMP_INSTALL, async (event: IpcMainInvokeEvent) => {
    const sender = event.sender
    const success = await installOmp((status: InstallStatus) => {
      if (!sender.isDestroyed()) {
        sender.send(IPC_CHANNELS.OMP_INSTALL_STATUS, status)
      }
    })
    if (success) {
      invalidateCliCache()
    }
    return success
  })

  ipcMain.handle(
    IPC_CHANNELS.FS_SET_ROOT,
    async (_event: IpcMainInvokeEvent, root: string) => {
      if (typeof root !== 'string' || !root.trim()) return false
      fsGuard.addRoot(root)
      return true
    }
  )

  ipcMain.handle(IPC_CHANNELS.FS_LIST_DIR, async (_event, dirPath: string) => {
    if (!fsGuard.isAllowed(dirPath)) return []
    const fs = await import('node:fs/promises')
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      return entries.map((e) => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        path: path.join(dirPath, e.name)
      }))
    } catch {
      return []
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.FS_LIST_PROJECT_FILES,
    async (_event, projectDir: string): Promise<string[]> => {
      if (typeof projectDir !== 'string' || !projectDir.trim()) return []
      if (!fsGuard.isAllowed(projectDir)) return []
      return listProjectFiles(path.resolve(projectDir))
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.FS_READ_FILE,
    async (_event, filePath: string): Promise<ReadFileResult> => {
      if (!fsGuard.isAllowed(filePath)) {
        return { ok: false, error: 'Access denied: path is outside the allowed project folders.' }
      }
      const fs = await import('node:fs/promises')
      try {
        const stat = await fs.stat(filePath)
        if (!stat.isFile()) {
          return { ok: false, error: 'Not a regular file.' }
        }
        if (stat.size > MAX_READ_FILE_BYTES) {
          return {
            ok: false,
            error: `File too large to preview (${(stat.size / 1024 / 1024).toFixed(1)} MB, limit 2 MB).`
          }
        }
        const buf = await fs.readFile(filePath)
        if (buf.subarray(0, 8192).includes(0)) {
          return { ok: false, error: 'Binary file cannot be previewed.' }
        }
        return { ok: true, content: buf.toString('utf-8') }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.PACKAGES_LIST, async () => {
    return listPackages()
  })

  /** Package sources become CLI argv — reject anything flag-shaped. */
  function validSource(source: unknown): source is string {
    return (
      typeof source === 'string' &&
      source.trim().length > 0 &&
      source.trim().length < 500 &&
      !source.trim().startsWith('-')
    )
  }

  ipcMain.handle(IPC_CHANNELS.PACKAGES_INSTALL, async (_event, source: string) => {
    if (!validSource(source)) return { ok: false, log: 'invalid package source' }
    return installPackage(source.trim())
  })

  ipcMain.handle(IPC_CHANNELS.PACKAGES_REMOVE, async (_event, source: string) => {
    if (!validSource(source)) return { ok: false, log: 'invalid package source' }
    return removePackage(source.trim())
  })

  ipcMain.handle(IPC_CHANNELS.PACKAGES_UPDATE, async (_event, source: string) => {
    if (!validSource(source)) return { ok: false, log: 'invalid package source' }
    return updatePackage(source.trim())
  })

  ipcMain.handle(
    IPC_CHANNELS.PACKAGES_SET_ENABLED,
    async (_event, source: string, enabled: boolean) => {
      if (!validSource(source)) return { ok: false, log: 'invalid package source' }
      return setPackageEnabled(source.trim(), Boolean(enabled))
    }
  )

  ipcMain.handle(IPC_CHANNELS.SHELL_SHOW_CLI_SETTINGS, async () => {
    const settingsFile = path.join(defaultPiAgentDir(), 'settings.json')
    shell.showItemInFolder(settingsFile)
    return true
  })

  ipcMain.handle(IPC_CHANNELS.STORE_GET, async (_event, key: keyof AppSettings) => {
    return getStore(key)
  })

  ipcMain.handle(IPC_CHANNELS.STORE_SET, async (_event, key: keyof AppSettings, value: unknown) => {
    setStore(key, value as never)
    // Transitional: the settings UI still writes the legacy toolAccess tier;
    // mirror it into permissionMode until the renderer exposes 'ask' itself.
    if (key === 'toolAccess' && (value === 'full' || value === 'no-bash' || value === 'readonly')) {
      setStore('permissionMode', value)
    }
    return true
  })

  ipcMain.handle(IPC_CHANNELS.DIALOG_SELECT_FOLDER, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle(IPC_CHANNELS.DIALOG_SELECT_FILE, async (_event, filters?: unknown) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: sanitizeDialogFilters(filters)
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // Image picker for the composer. The dialog itself is the user's consent,
  // so (like selectFile) the chosen path is read without the fsGuard root check.
  ipcMain.handle(IPC_CHANNELS.DIALOG_SELECT_IMAGE, async (): Promise<SelectImageResult> => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: Object.keys(IMAGE_MIME_BY_EXT) }]
    })
    const filePath = result.canceled ? undefined : result.filePaths[0]
    if (!filePath) return null
    const mimeType = IMAGE_MIME_BY_EXT[path.extname(filePath).slice(1).toLowerCase()]
    if (!mimeType) return { ok: false, error: 'notImage' }
    const fs = await import('node:fs/promises')
    try {
      const stat = await fs.stat(filePath)
      if (stat.size > MAX_IMAGE_BYTES) return { ok: false, error: 'tooLarge' }
      const buf = await fs.readFile(filePath)
      return { ok: true, name: path.basename(filePath), data: buf.toString('base64'), mimeType }
    } catch {
      return { ok: false, error: 'readFailed' }
    }
  })
}
