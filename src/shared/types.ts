export interface CliInfo {
  command: string
  /** Resolved absolute path to the executable, when found. */
  path?: string
  version?: string
  available: boolean
}

export interface Session {
  id: string
  cwd: string
  title: string
  createdAt: number
  status: 'idle' | 'running' | 'error'
}

export type SessionEvent =
  | { type: 'connected'; sessionId: string }
  | { type: 'message'; sessionId: string; role: 'user' | 'assistant' | 'system'; content: string }
  | { type: 'tool_call'; sessionId: string; tool: string; input: unknown; output?: unknown }
  | { type: 'tool_result'; sessionId: string; tool: string; output: unknown; isError: boolean }
  | { type: 'status'; sessionId: string; status: 'working' | 'idle' }
  | { type: 'error'; sessionId: string; message: string }
  | { type: 'closed'; sessionId: string }

/** pi package source flavor, derived from the source string in settings.json */
export type PackageSourceKind = 'npm' | 'git' | 'local'

export interface PackageResource {
  type: 'extension' | 'skill' | 'prompt' | 'theme'
  name: string
}

export interface PackageInfo {
  /** Verbatim source string as stored in settings.json — used for remove/update. */
  source: string
  kind: PackageSourceKind
  name: string
  description?: string
  version?: string
  enabled: boolean
  /** Resolved install location (dir or single file); undefined if not found on disk. */
  path?: string
  resources: PackageResource[]
  /** Versioned npm specs and git refs are pinned; `pi update` skips them. */
  pinned: boolean
}

export interface PackageActionResult {
  ok: boolean
  log: string
}

export type Language = 'zh' | 'en'

export interface AppSettings {
  theme: 'dark' | 'light'
  language: Language
  windowWidth: number
  windowHeight: number
  recentProjects: string[]
  setupComplete: boolean
}

export type InstallStatus =
  | { type: 'idle' }
  | { type: 'downloading'; progress: number; message: string }
  | { type: 'installing'; message: string }
  | { type: 'success' }
  | { type: 'error'; message: string }

export type ReadFileResult =
  | { ok: true; content: string }
  | { ok: false; error: string }

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  language: 'en',
  windowWidth: 1280,
  windowHeight: 800,
  recentProjects: [],
  setupComplete: false
}
