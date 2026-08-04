import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { IPC_CHANNELS } from '../shared/constants'
import { CliInfo, Session, SessionEvent, ModuleInfo, AppSettings, InstallStatus, ReadFileResult } from '../shared/types'

export interface ElectronAPI {
  detectCli: () => Promise<CliInfo>
  listSessions: () => Promise<Session[]>
  createSession: (cwd: string) => Promise<Session>
  sendMessage: (sessionId: string, text: string) => Promise<boolean>
  killSession: (sessionId: string) => Promise<boolean>
  onSessionEvent: (callback: (event: SessionEvent) => void) => () => void
  installOmp: () => Promise<boolean>
  onInstallStatus: (callback: (status: InstallStatus) => void) => () => void
  setFsRoot: (root: string) => Promise<boolean>
  listDir: (dirPath: string) => Promise<{ name: string; isDirectory: boolean; path: string }[]>
  readFile: (filePath: string) => Promise<ReadFileResult>
  scanModules: (cwd?: string) => Promise<ModuleInfo[]>
  setModuleEnabled: (moduleId: string, enabled: boolean) => Promise<string[]>
  getStore: <K extends keyof AppSettings>(key: K) => Promise<AppSettings[K]>
  setStore: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<boolean>
  selectFolder: () => Promise<string | null>
}

const api: ElectronAPI = {
  detectCli: () => ipcRenderer.invoke(IPC_CHANNELS.OMP_DETECT),
  listSessions: () => ipcRenderer.invoke(IPC_CHANNELS.OMP_LIST_SESSIONS),
  createSession: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.OMP_CREATE_SESSION, cwd),
  sendMessage: (sessionId: string, text: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OMP_SEND_MESSAGE, sessionId, text),
  killSession: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.OMP_KILL_SESSION, sessionId),
  onSessionEvent: (callback: (event: SessionEvent) => void) => () => {
    const handler = (_event: IpcRendererEvent, ev: SessionEvent) => callback(ev)
    ipcRenderer.on(IPC_CHANNELS.OMP_SESSION_EVENT, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.OMP_SESSION_EVENT, handler)
    }
  },
  installOmp: () => ipcRenderer.invoke(IPC_CHANNELS.OMP_INSTALL),
  onInstallStatus: (callback: (status: InstallStatus) => void) => () => {
    const handler = (_event: IpcRendererEvent, status: InstallStatus) => callback(status)
    ipcRenderer.on(IPC_CHANNELS.OMP_INSTALL_STATUS, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.OMP_INSTALL_STATUS, handler)
    }
  },
  setFsRoot: (root: string) => ipcRenderer.invoke(IPC_CHANNELS.FS_SET_ROOT, root),
  listDir: (dirPath: string) => ipcRenderer.invoke(IPC_CHANNELS.FS_LIST_DIR, dirPath),
  readFile: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.FS_READ_FILE, filePath),
  scanModules: (cwd?: string) => ipcRenderer.invoke(IPC_CHANNELS.MODULES_SCAN, cwd),
  setModuleEnabled: (moduleId: string, enabled: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.MODULES_SET_ENABLED, moduleId, enabled),
  getStore: (key: keyof AppSettings) => ipcRenderer.invoke(IPC_CHANNELS.STORE_GET, key),
  setStore: (key: keyof AppSettings, value: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.STORE_SET, key, value),
  selectFolder: () => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SELECT_FOLDER)
}

contextBridge.exposeInMainWorld('electronAPI', api)
