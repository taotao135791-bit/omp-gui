export interface CliInfo {
  command: string
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
  | { type: 'error'; sessionId: string; message: string }
  | { type: 'closed'; sessionId: string }

export interface ModuleInfo {
  id: string
  name: string
  description: string
  version?: string
  author?: string
  source: 'builtin' | 'global' | 'local'
  path: string
  enabled: boolean
}

export interface AppSettings {
  theme: 'dark' | 'light'
  windowWidth: number
  windowHeight: number
  enabledModules: string[]
  recentProjects: string[]
  setupComplete: boolean
}

export type InstallStatus =
  | { type: 'idle' }
  | { type: 'downloading'; progress: number; message: string }
  | { type: 'installing'; message: string }
  | { type: 'success' }
  | { type: 'error'; message: string }

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  windowWidth: 1280,
  windowHeight: 800,
  enabledModules: [],
  recentProjects: [],
  setupComplete: false
}
