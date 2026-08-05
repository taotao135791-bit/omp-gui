import { contextBridge, ipcRenderer, webUtils, IpcRendererEvent } from 'electron'
import { IPC_CHANNELS } from '../shared/constants'
import {
  CliInfo,
  Session,
  SessionEvent,
  PackageInfo,
  PackageActionResult,
  AppSettings,
  InstallStatus,
  ReadFileResult,
  ExtensionUiAnswer,
  ModelConfig
} from '../shared/types'

export interface ElectronAPI {
  detectCli: (force?: boolean) => Promise<CliInfo>
  listSessions: () => Promise<Session[]>
  createSession: (cwd: string) => Promise<Session>
  sendMessage: (sessionId: string, text: string) => Promise<boolean>
  killSession: (sessionId: string) => Promise<boolean>
  abortSession: (sessionId: string) => Promise<boolean>
  onSessionEvent: (callback: (event: SessionEvent) => void) => () => void
  installOmp: () => Promise<boolean>
  onInstallStatus: (callback: (status: InstallStatus) => void) => () => void
  setFsRoot: (root: string) => Promise<boolean>
  listDir: (dirPath: string) => Promise<{ name: string; isDirectory: boolean; path: string }[]>
  readFile: (filePath: string) => Promise<ReadFileResult>
  listPackages: () => Promise<PackageInfo[]>
  installPackage: (source: string) => Promise<PackageActionResult>
  removePackage: (source: string) => Promise<PackageActionResult>
  updatePackage: (source: string) => Promise<PackageActionResult>
  setPackageEnabled: (source: string, enabled: boolean) => Promise<PackageActionResult>
  getStore: <K extends keyof AppSettings>(key: K) => Promise<AppSettings[K]>
  setStore: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<boolean>
  selectFolder: () => Promise<string | null>
  selectFile: () => Promise<string | null>
  showCliSettings: () => Promise<boolean>
  respondUi: (sessionId: string, requestId: string, answer: ExtensionUiAnswer) => Promise<boolean>
  getModelConfig: () => Promise<ModelConfig>
  setModelConfig: (patch: Partial<Omit<ModelConfig, 'authProviders'>>) => Promise<PackageActionResult>
  setApiKey: (provider: string, key: string) => Promise<PackageActionResult>
  clearApiKey: (provider: string) => Promise<PackageActionResult>
  getAppVersion: () => Promise<string>
  /** Real filesystem path for a File dropped from Finder (contextIsolation-safe). */
  getPathForFile: (file: File) => string
}

const api: ElectronAPI = {
  detectCli: (force?: boolean) => ipcRenderer.invoke(IPC_CHANNELS.OMP_DETECT, force),
  listSessions: () => ipcRenderer.invoke(IPC_CHANNELS.OMP_LIST_SESSIONS),
  createSession: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.OMP_CREATE_SESSION, cwd),
  sendMessage: (sessionId: string, text: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OMP_SEND_MESSAGE, sessionId, text),
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
  listPackages: () => ipcRenderer.invoke(IPC_CHANNELS.PACKAGES_LIST),
  installPackage: (source: string) => ipcRenderer.invoke(IPC_CHANNELS.PACKAGES_INSTALL, source),
  removePackage: (source: string) => ipcRenderer.invoke(IPC_CHANNELS.PACKAGES_REMOVE, source),
  updatePackage: (source: string) => ipcRenderer.invoke(IPC_CHANNELS.PACKAGES_UPDATE, source),
  setPackageEnabled: (source: string, enabled: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.PACKAGES_SET_ENABLED, source, enabled),
  getStore: (key: keyof AppSettings) => ipcRenderer.invoke(IPC_CHANNELS.STORE_GET, key),
  setStore: (key: keyof AppSettings, value: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.STORE_SET, key, value),
  selectFolder: () => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SELECT_FOLDER),
  selectFile: () => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SELECT_FILE),
  showCliSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SHELL_SHOW_CLI_SETTINGS),
  respondUi: (sessionId: string, requestId: string, answer: ExtensionUiAnswer) =>
    ipcRenderer.invoke(IPC_CHANNELS.OMP_RESPOND_UI, sessionId, requestId, answer),
  getModelConfig: () => ipcRenderer.invoke(IPC_CHANNELS.PI_GET_MODEL_CONFIG),
  setModelConfig: (patch: Partial<Omit<ModelConfig, 'authProviders'>>) =>
    ipcRenderer.invoke(IPC_CHANNELS.PI_SET_MODEL_CONFIG, patch),
  setApiKey: (provider: string, key: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PI_SET_API_KEY, provider, key),
  clearApiKey: (provider: string) => ipcRenderer.invoke(IPC_CHANNELS.PI_CLEAR_API_KEY, provider),
  getAppVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP_VERSION),
  getPathForFile: (file: File) => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('electronAPI', api)
