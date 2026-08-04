import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { getStore, setStore } from './store'
import { registerIpc } from './ipc'

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

function createWindow() {
  const width = getStore('windowWidth')
  const height = getStore('windowHeight')

  const win = new BrowserWindow({
    width,
    height,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('resized', () => {
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
