import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { getStore, setStore } from './store'
import { registerIpc } from './ipc'
import { syncMachineSkills } from './piSettings'

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

function createWindow() {
  // Clamp persisted sizes in case the store holds corrupt values
  const width = Math.max(900, Math.min(getStore('windowWidth') || 1280, 5120))
  const height = Math.max(600, Math.min(getStore('windowHeight') || 800, 5120))

  const win = new BrowserWindow({
    width,
    height,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // 'resize' fires on all platforms; 'resized' is Windows-only
  win.on('resize', () => {
    const [w, h] = win.getSize()
    setStore('windowWidth', w)
    setStore('windowHeight', h)
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  registerIpc()
  // Keep pi's skill overrides in line with the GUI toggle — pi loads
  // ~/.agents/skills (other agents' skills) into every session by default.
  syncMachineSkills(getStore('machineSkills'))
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
