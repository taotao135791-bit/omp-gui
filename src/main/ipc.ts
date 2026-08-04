import { ipcMain, dialog, shell, BrowserWindow, IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import { IPC_CHANNELS } from '../shared/constants'
import { SessionEvent, AppSettings, InstallStatus, ReadFileResult } from '../shared/types'
import {
  detectCli,
  invalidateCliCache,
  createSession,
  sendMessage,
  killSession,
  abortSession,
  listSessions
} from './omp'
import {
  listPackages,
  installPackage,
  removePackage,
  updatePackage,
  setPackageEnabled,
  defaultPiAgentDir
} from './packages'
import { getStore, setStore } from './store'
import { installOmp } from './installer'
import { FsGuard } from './fsGuard'

const fsGuard = new FsGuard()

const MAX_READ_FILE_BYTES = 2 * 1024 * 1024

function broadcastSessionEvent(event: SessionEvent): void {
  const wins = BrowserWindow.getAllWindows()
  for (const win of wins) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.OMP_SESSION_EVENT, event)
    }
  }
}

export function registerIpc() {
  ipcMain.handle(IPC_CHANNELS.OMP_DETECT, async (_event: IpcMainInvokeEvent, force?: boolean) => {
    if (force) invalidateCliCache()
    return detectCli()
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
    async (_event: IpcMainInvokeEvent, sessionId: string, text: string) => {
      return sendMessage(sessionId, text)
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
    return true
  })

  ipcMain.handle(IPC_CHANNELS.DIALOG_SELECT_FOLDER, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle(IPC_CHANNELS.DIALOG_SELECT_FILE, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Extensions', extensions: ['ts', 'js'] }]
    })
    return result.canceled ? null : result.filePaths[0]
  })
}
