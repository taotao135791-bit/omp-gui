import { useAppStore } from '../store'

/**
 * Create a chat session for the current project, prompting for a folder
 * when none is selected. Returns the new session id, or null when the
 * user cancelled the folder picker.
 */
export async function createSessionForCurrentProject(): Promise<string | null> {
  const { currentProject, setCurrentProject, addSession } = useAppStore.getState()
  let project = currentProject
  if (!project) {
    project = await window.electronAPI.selectFolder()
    if (!project) return null
    setCurrentProject(project)
    window.electronAPI.setFsRoot(project)
  }
  const session = await window.electronAPI.createSession(project)
  addSession(session)
  return session.id
}
