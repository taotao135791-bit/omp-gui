import { useAppStore } from '../store'

/**
 * Create a chat session for the current project, prompting for a folder
 * when none is selected. Returns the new session id, or null when the
 * user cancelled the folder picker.
 *
 * Next-session overrides (composer pickers used without an active session)
 * are consumed here and passed as spawn args — they apply to exactly this
 * session and never touch the runtime default.
 */
export async function createSessionForCurrentProject(): Promise<string | null> {
  const { currentProject, setCurrentProject, addSession, consumeSessionOverrides } =
    useAppStore.getState()
  let project = currentProject
  if (!project) {
    project = await window.electronAPI.selectFolder()
    if (!project) return null
    setCurrentProject(project)
    window.electronAPI.setFsRoot(project)
  }
  const overrides = consumeSessionOverrides()
  const session = await window.electronAPI.createSession(project, overrides)
  addSession(session)
  return session.id
}
