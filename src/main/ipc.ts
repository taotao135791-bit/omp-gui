import { ipcMain, dialog, IpcMainInvokeEvent, IpcMainEvent } from 'electron'
import { IPC_CHANNELS } from '../shared/constants'
import { SessionEvent, ModuleInfo, AppSettings, InstallStatus } from '../shared/types'
import {
  detectCli,
  createSession,
  sendMessage,
  killSession,
  listSessions
} from './omp'
import { scanModules } from './modules'
import { getStore, setStore, getAllSettings } from './store'
import { installOmp } from './installer'

const sessionListeners = new Map<string, Set<(event: SessionEvent) => void>>()

function getListeners(sessionId: string): Set<(event: SessionEvent) => void> {
  if (!sessionListeners.has(sessionId)) {
    sessionListeners.set(sessionId, new Set())
  }
  return sessionListeners.get(sessionId)!
}

export function registerIpc() {
  ipcMain.handle(IPC_CHANNELS.OMP_DETECT, async () => detectCli())

  ipcMain.handle(
    IPC_CHANNELS.OMP_LIST_SESSIONS,
    async () => listSessions()
  )

  ipcMain.handle(
    IPC_CHANNELS.OMP_CREATE_SESSION,
    async (_event: IpcMainInvokeEvent, cwd: string) => {
      return createSession(cwd, (ev) => {
        const listeners = sessionListeners.get(ev.sessionId)
        if (listeners) {
          listeners.forEach((cb) => cb(ev))
        }
      })
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

  ipcMain.handle(IPC_CHANNELS.OMP_INSTALL, async (event: IpcMainInvokeEvent) => {
    const sender = event.sender
    const success = await installOmp((status: InstallStatus) => {
      sender.send(IPC_CHANNELS.OMP_INSTALL_STATUS, status)
    })
    return success
  })

  ipcMain.on(
    IPC_CHANNELS.OMP_SESSION_EVENT,
    (event: IpcMainEvent, sessionId: string) => {
      const listener = (ev: SessionEvent) => {
        event.sender.send(IPC_CHANNELS.OMP_SESSION_EVENT, ev)
      }
      getListeners(sessionId).add(listener)
      event.sender.on('destroyed', () => {
        getListeners(sessionId).delete(listener)
      })
    }
  )

  ipcMain.handle(IPC_CHANNELS.FS_LIST_DIR, async (_event, dirPath: string) => {
    const fs = await import('node:fs/promises')
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      return entries.map((e) => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        path: dirPath + '/' + e.name
      }))
    } catch (err) {
      return []
    }
  })

  ipcMain.handle(IPC_CHANNELS.FS_READ_FILE, async (_event, filePath: string) => {
    const fs = await import('node:fs/promises')
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      return content
    } catch (err) {
      return ''
    }
  })

  ipcMain.handle(IPC_CHANNELS.MODULES_SCAN, async (_event, cwd?: string) => {
    return scanModules(cwd)
  })

  ipcMain.handle(
    IPC_CHANNELS.MODULES_SET_ENABLED,
    async (_event, moduleId: string, enabled: boolean) => {
      const current = getStore('enabledModules')
      const next = enabled
        ? Array.from(new Set([...current, moduleId]))
        : current.filter((id) => id !== moduleId)
      setStore('enabledModules', next)
      return next
    }
  )

  ipcMain.handle(IPC_CHANNELS.STORE_GET, async (_event, key: keyof AppSettings) => {
    return getStore(key)
  })

  ipcMain.handle(IPC_CHANNELS.STORE_SET, async (_event, key: keyof AppSettings, value: unknown) => {
    setStore(key, value as never)
    return true
  })

  ipcMain.handle('dialog:select-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })
}
