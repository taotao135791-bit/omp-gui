import { BrowserWindow, Notification } from 'electron'
import { IPC_CHANNELS } from '../shared/constants'
import { SessionEvent } from '../shared/types'
import { getLastAssistantText, getSession } from './omp'
import { getStore } from './store'

/**
 * Desktop notification when an agent turn finishes (agent_end → status idle)
 * while the window is unfocused. Clicking it focuses the window and asks the
 * renderer to select that session.
 */
export function maybeNotifyTurnFinished(event: SessionEvent): void {
  if (event.type !== 'status' || event.status !== 'idle') return
  if (getStore('notifications') === false) return

  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed() && win.isFocused()) return

  const title = getSession(event.sessionId)?.title || 'OMP GUI'
  const text = getLastAssistantText(event.sessionId).trim()
  const body = text ? text.slice(0, 120) : 'Agent turn finished.'

  const notification = new Notification({ title, body, silent: false })
  notification.on('click', () => {
    if (win && !win.isDestroyed()) {
      win.show()
      win.focus()
      win.webContents.send(IPC_CHANNELS.NOTIFY_SELECT_SESSION, event.sessionId)
    }
  })
  notification.show()
}
