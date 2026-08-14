export interface CliInfo {
  command: string
  /** Resolved absolute path to the executable, when found. */
  path?: string
  version?: string
  available: boolean
}

/**
 * Feature surface of the detected CLI, for the settings page. Probed via
 * `--version` plus runtime session bootstrap: the RPC fields are declared
 * by the runtime's `ready` frame and the negotiated protocol (see
 * src/main/omp/OmpHandshake.ts, docs/protocol-facts.md).
 */
export interface CliCapabilities {
  /** Parsed `<cli> --version` output; null when the probe failed. */
  cliVersion: string | null
  /** Negotiated RPC protocol version; 1 until a session bootstraps v2. */
  protocol: number
  /** Runtime family detected at session bootstrap (absent before any session). */
  profile?: 'legacy' | 'current'
  /** RPC versions the runtime advertised in its ready frame. */
  protocolVersions?: number[]
  /** Runtime-declared physical frame limit, bytes. */
  maxFrameBytes?: number
  /** Runtime-declared reassembled logical frame limit, bytes. */
  maxReassembledFrameBytes?: number
  steering: boolean
  followUp: boolean
  images: boolean
  compaction: boolean
  extensionUi: boolean
  fork: boolean
  thinking: boolean
}

/**
 * Runtime lifecycle of a session's agent process, driven by RPC events
 * (see src/main/omp/OmpSession.ts for the transition table).
 *
 * The renderer maps these to busy explicitly (working/waiting_for_user/
 * aborting → busy; idle/failed → not busy) and ignores unknown values
 * defensively. The main process currently only emits 'working' and 'idle'.
 */
export type SessionRuntimeState =
  | 'starting'
  | 'idle'
  | 'working'
  | 'waiting_for_user'
  | 'aborting'
  | 'failed'
  | 'closed'

export interface Session {
  id: string
  cwd: string
  title: string
  createdAt: number
  status: 'idle' | 'running' | 'error'
  /** Session file this session was resumed from, if any. */
  resumeFrom?: string
  /** pi's on-disk session file (backfilled after spawn; used to dedup history). */
  sessionFile?: string
}

export type SessionEvent =
  | { type: 'connected'; sessionId: string }
  | { type: 'message'; sessionId: string; role: 'user' | 'assistant' | 'system'; content: string }
  /** Streaming thinking delta of the in-flight assistant message. */
  | { type: 'thinking'; sessionId: string; delta: string }
  /** `id` is pi's stable toolCallId — parallel tool runs must be matched by it. */
  | { type: 'tool_call'; sessionId: string; id?: string; tool: string; input: unknown; output?: unknown }
  | { type: 'tool_result'; sessionId: string; id?: string; tool: string; output: unknown; isError: boolean }
  /**
   * `isTerminal` is only meaningful on agent_end-derived idle events: pi
   * 0.80.3 has no such field (agent_end is always terminal → true); a future
   * upstream may send explicit `false` for non-terminal ends.
   */
  | { type: 'status'; sessionId: string; status: SessionRuntimeState; isTerminal?: boolean }
  | { type: 'compaction'; sessionId: string; phase: 'start' | 'end' }
  /** `recoverable` is false when the session process died (crash/exit). */
  | { type: 'error'; sessionId: string; message: string; recoverable?: boolean }
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
  /** The extension dismissed a pending dialog; drop the matching ui_request. */
  | { type: 'ui_cancel'; sessionId: string; id: string }
  /** Runtime resolved a new thinking level (may differ from the requested one). */
  | { type: 'thinking_level_changed'; sessionId: string; level?: string }
  /** The session's model changed (set_model / fallback); refetch get_state. */
  | { type: 'model_changed'; sessionId: string }
  /**
   * A subagent (child agent) lifecycle/status event, normalized from upstream
   * `subagent_lifecycle` / `subagent_event` frames. Fields are tolerated —
   * every one is optional because the upstream payload shape varies by runtime
   * version; the renderer projection treats absent fields as unknown, never
   * fabricates them. Emitted only when the runtime's subagent subscription is
   * enabled (see `set_subagent_subscription`).
   */
  | {
      type: 'subagent'
      sessionId: string
      agentId?: string
      parentAgentId?: string
      name?: string
      status?: string
      phase?: string
      provider?: string
      model?: string
      purpose?: string
      startedAt?: number
      endedAt?: number
      resultSummary?: string
    }
  /** Streamed activity text of a subagent (normalized from `subagent_progress`). */
  | { type: 'subagent_progress'; sessionId: string; agentId?: string; text?: string }
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
  defaultThinkingLevel: '' | 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
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

/**
 * Session RPC thinking levels — the enum of `set_thinking_level` /
 * `--thinking`. A live session may be set to `off`. This is a *session
 * runtime state*, never the global default.
 */
export type SessionThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** Ordered session levels (least to most intensive). */
export const SESSION_THINKING_LEVELS: readonly SessionThinkingLevel[] = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max'
]

/**
 * Config `defaultThinkingLevel` enum, verified against current Oh My Pi
 * 17.2.12 (`omp config set defaultThinkingLevel`): `auto` is valid and `off`
 * is NOT — the default is a reasoning-depth setting, not an on/off switch.
 * Exact accepted set: minimal, low, medium, high, xhigh, max, auto.
 */
export type DefaultThinkingLevel = 'auto' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** Ordered config default levels (auto first, then least to most intensive). */
export const DEFAULT_THINKING_LEVELS: readonly DefaultThinkingLevel[] = [
  'auto',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max'
]

// ---------------------------------------------------------------------------
// Runtime settings / auth / models (normalized; never upstream-internal schema)
// ---------------------------------------------------------------------------

/** Which runtime family the detected CLI belongs to. */
export type RuntimeProfile = 'current' | 'legacy'

export type CapabilityState = 'supported' | 'unsupported' | 'unknown'

/** A provider as the runtime reports it (get_login_providers). */
export interface RuntimeProvider {
  id: string
  name: string
  available: boolean
  authenticated: boolean
}

/** A model as the runtime catalogs it (credential-filtered availability). */
export interface RuntimeModelInfo {
  provider: string
  id: string
  /** provider/id — the form config and set_model take. */
  selector: string
  name: string
  contextWindow?: number
  maxTokens?: number
  reasoning: boolean
  /** Per-model supported thinking levels (off is universal); empty = unknown. */
  thinking: string[]
}

/** Runtime-resolved default model/thinking state (new sessions). */
export interface RuntimeModelState {
  /**
   * Default model selector, read from `modelRoles.default` (never
   * `enabledModels[0]`). '' = runtime automatic resolution.
   */
  defaultModel: string
  /** True when `modelRoles.default` is explicitly set; false = automatic. */
  defaultModelExplicit: boolean
  defaultThinkingLevel: string
}

export interface RuntimeCapabilities {
  providers: CapabilityState
  nativeLogin: CapabilityState
  logout: CapabilityState
  modelCatalog: CapabilityState
  defaultModelConfig: CapabilityState
  defaultThinkingConfig: CapabilityState
  machineSkillsConfig: CapabilityState
}

/**
 * Runtime-reported machine-skills toggle state. `unknown` covers a missing /
 * non-boolean read-back; it must never render as an explicit ON toggle.
 */
export type MachineSkillsState = 'enabled' | 'disabled' | 'unknown'

/** Settings-page overview: everything is runtime-reported, nothing assumed. */
export interface RuntimeOverview {
  profile: RuntimeProfile
  capabilities: RuntimeCapabilities
  providers: RuntimeProvider[]
  modelState: RuntimeModelState
  /**
   * `skills.enableAgentsUser` read-back as a truth value. Capability
   * (whether this OMP version exposes the key at all) lives separately in
   * `capabilities.machineSkillsConfig`.
   */
  machineSkillsState: MachineSkillsState
}

/**
 * Login flow state machine. Interactive prompts arrive as part of the state
 * (input/select/confirm); the renderer answers them via auth:answerLogin.
 */
export type LoginState =
  | { status: 'idle' }
  | { status: 'starting'; providerId: string }
  | {
      status: 'waiting_for_browser'
      providerId: string
      instructions?: string
      /** The URL the runtime asked to open (never auto-opened — user-initiated). */
      url?: string
      launchUrl?: string
    }
  | {
      status: 'waiting_for_input'
      providerId: string
      requestId: string
      title: string
      placeholder?: string
      timeoutMs?: number
    }
  | {
      status: 'waiting_for_select'
      providerId: string
      requestId: string
      title: string
      options: string[]
      timeoutMs?: number
    }
  | {
      status: 'waiting_for_confirm'
      providerId: string
      requestId: string
      title: string
      message?: string
      timeoutMs?: number
    }
  | { status: 'verifying'; providerId: string; message?: string }
  | { status: 'connected'; providerId: string }
  | { status: 'failed'; providerId: string; message: string }
  | { status: 'cancelled'; providerId: string }

/** Answer to a login prompt (mirrors the extension UI answer shapes). */
export type LoginAnswer = { value: string } | { confirmed: boolean } | { cancelled: true }

/** An image attached to a prompt/steer/follow_up RPC command. */
export interface PromptImage {
  type: 'image'
  /** base64-encoded image bytes */
  data: string
  mimeType: string
}

/**
 * Result of the image picker dialog: the image bytes as base64, or a
 * categorized failure. `null` means the user cancelled the dialog.
 */
export type SelectImageResult =
  | { ok: true; name: string; data: string; mimeType: string }
  | { ok: false; error: 'tooLarge' | 'notImage' | 'readFailed' }
  | null

/** How a prompt sent mid-stream is queued by pi. */
export type StreamingBehavior = 'steer' | 'followUp'

/**
 * A chat message as rendered by the GUI. Mirrors the renderer's MessageLike;
 * defined here so the main process can rebuild transcripts for resumed sessions.
 */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  /** system messages only: 'info' renders neutral instead of the error style. */
  variant?: 'info'
  /** Thinking text of an assistant message (collapsible block in the UI). */
  thinking?: string
  toolCall?: {
    tool: string
    input: unknown
    output?: unknown
    isError?: boolean
  }
}

/** A persisted pi session file discovered under the agent's sessions dir. */
export interface HistorySessionInfo {
  /** Session uuid from the file header. */
  uuid: string
  filePath: string
  /** First user message, truncated to 80 chars; 'Untitled' when absent. */
  title: string
  /** Session start time, epoch ms. */
  timestamp: number
  cwd: string
}

/**
 * Legacy three-tier tool access, still used by the current renderer UI.
 * Subset of PermissionMode — mirrored into it on write (see ipc.ts).
 */
export type ToolAccess = 'full' | 'no-bash' | 'readonly'

/**
 * Permission mode applied when a session is created:
 * 'full'/'no-bash'/'readonly' map to --exclude-tools; 'ask' leaves every tool
 * enabled and gates each call through the bundled approval extension.
 */
export type PermissionMode = 'full' | 'no-bash' | 'readonly' | 'ask'

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
  /** Legacy three-tier setting kept for the current renderer UI. */
  toolAccess: ToolAccess
  /** Effective per-session permission mode; supersedes toolAccess. */
  permissionMode: PermissionMode
  /** Load machine-local ~/.agents/skills into sessions (default off — they belong to other agents). */
  machineSkills: boolean
  /** Desktop notification when an agent turn finishes while the window is unfocused. */
  notifications: boolean
  /** Sidebar: sessions pinned to the top of the list. */
  pinnedSessionIds: string[]
  /** Sidebar: sessions folded away into the archived group. */
  archivedSessionIds: string[]
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
  permissionMode: 'ask',
  machineSkills: false,
  notifications: true,
  pinnedSessionIds: [],
  archivedSessionIds: []
}

/** Snapshot of a live session, from the RPC get_state command. */
export interface SessionState {
  isStreaming: boolean
  isCompacting: boolean
  pendingMessageCount: number
  sessionId: string
  sessionName?: string
  /** pi's on-disk session JSONL path. */
  sessionFile?: string
  messageCount: number
  thinkingLevel: string
  model?: unknown
  autoCompactionEnabled?: boolean
}

/** A git snapshot of the project worktree, taken before an agent turn. */
export interface CheckpointInfo {
  id: string
  sessionId: string
  /** Dangling commit sha holding the full tree (never referenced by a branch). */
  sha: string
  /** Untracked files present at checkpoint time (restore keeps these). */
  untracked: string[]
  promptPreview: string
  /** Index of the user message this checkpoint precedes. */
  msgIndex: number
  createdAt: number
}

export interface GitFileChange {
  path: string
  status: 'M' | 'A' | 'D' | 'untracked'
  /** null for binary files and untracked entries */
  additions: number | null
  deletions: number | null
}

export interface GitInfo {
  branch: string
  files: GitFileChange[]
  totalAdditions: number
  totalDeletions: number
}

/** Auto-update state machine, broadcast to the renderer on every change. */
export type UpdaterStatus =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string }
  | { status: 'downloading' }
  | { status: 'progress'; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string }
  /** Dev builds have no updater; returned by updaterCheck only. */
  | { status: 'dev' }
