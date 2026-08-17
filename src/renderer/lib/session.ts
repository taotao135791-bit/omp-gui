import { useAppStore } from '../store'

/**
 * Create a chat session for the current workspace, prompting for a folder
 * when none is selected. Returns the new session id, or null when the
 * user cancelled the folder picker.
 *
 * Next-session overrides (composer pickers used without an active session)
 * are consumed here and passed as spawn args — they apply to exactly this
 * session and never touch the runtime default.
 */
export async function createSessionForCurrentProject(): Promise<string | null> {
  const {
    currentWorkspace,
    selectWorkspace,
    addSession,
    consumeSessionOverrides
  } = useAppStore.getState()
  let grant = currentWorkspace
  if (!grant) {
    await selectWorkspace()
    grant = useAppStore.getState().currentWorkspace
    if (!grant) return null
  }
  const overrides = consumeSessionOverrides()
  const session = await window.electronAPI.createSession(grant.id, overrides)
  addSession(session)
  return session.id
}
