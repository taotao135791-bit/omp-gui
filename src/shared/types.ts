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
  | { type: 'compaction'; sessionId: string; phase: 'start' | 'end' }
  | { type: 'error'; sessionId: string; message: string }
  | {
      type: 'ui_request'
      sessionId: string
      id: string
      method: 'select' | 'confirm' | 'input' | 'editor'
      title: string
      message?: string
      options?: string[]
      placeholder?: string
      prefill?: string
      timeout?: number
    }
  | { type: 'closed'; sessionId: string }

/** Token/context usage of a session, as returned by the RPC get_session_stats command. */
export interface SessionStats {
  userMessages: number
  assistantMessages: number
  toolCalls: number
  tokens: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
    total: number
  }
  cost: number
  contextUsage?: {
    tokens: number | null
    contextWindow: number
    percent: number | null
  }
}

/** A slash command the session can run via prompt, from the RPC get_commands command. */
export interface SlashCommand {
  name: string
  description?: string
  source: 'extension' | 'prompt' | 'skill'
}

/** Answer to an extension UI dialog, sent back over the session's stdin. */
export type ExtensionUiAnswer = { cancelled: true } | { value: string } | { confirmed: boolean }

/** pi model/agent configuration, persisted in pi's own settings.json. */
export interface ModelConfig {
  defaultProvider: string
  defaultModel: string
  defaultThinkingLevel: '' | 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
  projectTrust: 'ask' | 'always' | 'never'
  /** Providers with stored credentials in auth.json (ids only, never secrets). */
  authProviders: string[]
}

/**
 * A model pi can actually use (credentials present), as returned by the RPC
 * `get_available_models` command — only the fields the GUI needs.
 */
export interface PiModel {
  id: string
  name: string
  provider: string
  reasoning: boolean
}

/** API-key providers pi supports (providers.md), shown in Settings. */
export const PI_PROVIDERS: { id: string; label: string }[] = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'google', label: 'Google Gemini' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'kimi-coding', label: 'Kimi For Coding' },
  { id: 'minimax', label: 'MiniMax' },
  { id: 'minimax-cn', label: 'MiniMax (China)' },
  { id: 'zai', label: 'ZAI Coding Plan' },
  { id: 'zai-coding-cn', label: 'ZAI Coding (China)' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'xai', label: 'xAI' },
  { id: 'groq', label: 'Groq' },
  { id: 'mistral', label: 'Mistral' },
  { id: 'cerebras', label: 'Cerebras' },
  { id: 'nvidia', label: 'NVIDIA NIM' },
  { id: 'together', label: 'Together AI' },
  { id: 'fireworks', label: 'Fireworks' },
  { id: 'huggingface', label: 'Hugging Face' },
  { id: 'vercel-ai-gateway', label: 'Vercel AI Gateway' },
  { id: 'azure-openai-responses', label: 'Azure OpenAI' },
  { id: 'opencode', label: 'OpenCode Zen' },
  { id: 'opencode-go', label: 'OpenCode Go' },
  { id: 'ant-ling', label: 'Ant Ling' },
  { id: 'xiaomi', label: 'Xiaomi MiMo' },
  { id: 'cloudflare-ai-gateway', label: 'Cloudflare AI Gateway' },
  { id: 'cloudflare-workers-ai', label: 'Cloudflare Workers AI' }
]

/** How much the agent may do in a session; maps to --exclude-tools. */
export type ToolAccess = 'full' | 'no-bash' | 'readonly'

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

/** A pi package found on the npm registry (community/curated lists). */
export interface CommunityPackageInfo {
  name: string
  description: string
  version: string
}

export type Language = 'zh' | 'en'

export interface AppSettings {
  theme: 'dark' | 'light'
  language: Language
  windowWidth: number
  windowHeight: number
  recentProjects: string[]
  setupComplete: boolean
  toolAccess: ToolAccess
  /** Load machine-local ~/.agents/skills into sessions (default off — they belong to other agents). */
  machineSkills: boolean
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
  setupComplete: false,
  toolAccess: 'full',
  machineSkills: false
}
