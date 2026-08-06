import { spawn, ChildProcess } from 'node:child_process'
import { accessSync, constants, existsSync, mkdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { app } from 'electron'
import {
  ChatMessage,
  CliInfo,
  ExtensionUiAnswer,
  PermissionMode,
  PromptImage,
  Session,
  SessionEvent,
  SessionState,
  SessionStats,
  SlashCommand,
  StreamingBehavior,
  ThinkingLevel
} from '../shared/types'
import { getStore, setStore } from './store'
import { parseRpcLine, drainLines, extensionUiResponse } from './protocol'
import { AgentMessage, mapAgentMessages } from './messageMapping'
import { buildLanguageArgs } from './languageArgs'
import { isSessionFilePath } from './sessionHistory'

interface PendingQuery {
  resolve: (payload: Record<string, unknown> | null) => void
  timer: NodeJS.Timeout
}

interface SessionEntry {
  process: ChildProcess
  session: Session
  /** In-flight RPC queries awaiting their response, keyed by request id. */
  pending: Map<string, PendingQuery>
  /** Assistant text of the in-flight turn, accumulated from text deltas. */
  draftText: string
  /** Finalized assistant text of the last completed turn (for notifications). */
  lastAssistantText: string
}

const sessions = new Map<string, SessionEntry>()

// Only successful detections are cached; a negative result is re-checked
// every time so the app picks up a CLI installed after launch.
let cliInfoCache: CliInfo | null = null

export function detectCli(): CliInfo {
  if (cliInfoCache) return cliInfoCache

  for (const cmd of ['omp', 'pi']) {
    const candidate = findExecutable(cmd)
    if (candidate) {
      cliInfoCache = { command: cmd, path: candidate, available: true }
      return cliInfoCache
    }
  }

  return { command: 'omp', available: false }
}

/** Clear the cached CLI info (e.g. after a successful install). */
export function invalidateCliCache(): void {
  cliInfoCache = null
}

/**
 * GUI apps on macOS/Linux are launched with a minimal PATH that usually
 * excludes package-manager bin dirs, so check well-known locations too.
 */
export function executableSearchDirs(): string[] {
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean)
  const home = homedir()
  dirs.push(
    '/opt/homebrew/bin',
    '/usr/local/bin',
    path.join(home, '.local', 'bin'),
    path.join(home, '.npm-global', 'bin'),
    path.join(home, 'bin')
  )
  return Array.from(new Set(dirs))
}

function findExecutable(cmd: string): string | null {
  for (const dir of executableSearchDirs()) {
    const full = path.join(dir, cmd)
    try {
      if (!existsSync(full) || !statSync(full).isFile()) continue
      accessSync(full, constants.X_OK)
      return full
    } catch {
      continue
    }
  }
  return null
}

export function listSessions(): Session[] {
  return Array.from(sessions.values()).map((s) => s.session)
}

export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId)?.session
}

/** Assistant text produced by the session's last completed turn ('' if none). */
export function getLastAssistantText(sessionId: string): string {
  return sessions.get(sessionId)?.lastAssistantText ?? ''
}

/** Path of the bundled per-tool approval extension shipped with the GUI. */
function approvalExtensionPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'omp-approval', 'index.ts')
    : path.join(app.getAppPath(), 'resources', 'omp-approval', 'index.ts')
}

interface ApprovalConfig {
  mode: 'off' | 'writes' | 'all'
  locale?: 'zh' | 'en'
}

/**
 * Write the approval extension config for a new session. Each session gets
 * its own file so concurrently running sessions with different modes never
 * clobber each other; the extension re-reads it (mtime-cached) on every
 * tool call.
 */
function writeApprovalConfig(sessionId: string, config: ApprovalConfig): string {
  const file = path.join(app.getPath('userData'), `omp-approval-config-${sessionId}.json`)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(config, null, 2))
  return file
}

/**
 * Map the permission mode to CLI flags plus an approval config:
 * - full:      every tool enabled, approval extension inert
 * - no-bash:   bash excluded, approval extension inert
 * - readonly:  bash/edit/write excluded, approval extension inert
 * - ask:       every tool enabled, extension asks before bash/edit/write
 */
function resolvePermissionMode(mode: PermissionMode): { excludeTools: string | null; approval: ApprovalConfig } {
  switch (mode) {
    case 'no-bash':
      return { excludeTools: 'bash', approval: { mode: 'off' } }
    case 'readonly':
      return { excludeTools: 'bash,edit,write', approval: { mode: 'off' } }
    case 'ask':
      return { excludeTools: null, approval: { mode: 'writes', locale: getStore('language') } }
    case 'full':
    default:
      return { excludeTools: null, approval: { mode: 'off' } }
  }
}

/** Accumulate assistant text per turn; turn end finalizes it for notifications. */
function trackAssistantText(sessionId: string, event: SessionEvent): void {
  const entry = sessions.get(sessionId)
  if (!entry) return
  if (event.type === 'message' && event.role === 'assistant') {
    entry.draftText += event.content
  } else if ((event.type === 'status' && event.status === 'idle') || event.type === 'error') {
    entry.lastAssistantText = entry.draftText
    entry.draftText = ''
  }
}

export function createSession(
  cwd: string,
  onEvent: (event: SessionEvent) => void,
  opts?: { resumeSessionPath?: string }
): Session {
  const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const cli = detectCli()

  if (!cli.available) {
    const errorEvent: SessionEvent = {
      type: 'error',
      sessionId: id,
      message: 'Oh My Pi (omp) or Pi CLI not found. Please install omp first: https://omp.sh'
    }
    setTimeout(() => onEvent(errorEvent), 0)
    return {
      id,
      cwd,
      title: 'Uninitialized',
      createdAt: Date.now(),
      status: 'error'
    }
  }

  // pi loads installed packages (settings.json) and auto-discovered extension
  // dirs itself on startup; the GUI manages them through the Packages page.
  const args = ['--mode', 'rpc']
  // pi has no built-in tool approval; coarse-grained gating goes through
  // --exclude-tools, per-call approval through the bundled extension.
  const { excludeTools, approval } = resolvePermissionMode(getStore('permissionMode'))
  if (excludeTools) {
    args.push('--exclude-tools', excludeTools)
  }
  const approvalExtension = approvalExtensionPath()
  if (existsSync(approvalExtension)) {
    args.push('-e', approvalExtension)
  }
  // Resume a persisted session file when requested (history panel).
  if (opts?.resumeSessionPath) {
    args.push('--session', opts.resumeSessionPath)
  }
  // Steer the reply language to the UI language (no flag for English).
  args.push(...buildLanguageArgs(getStore('language')))
  const approvalConfigFile = writeApprovalConfig(id, approval)
  const proc = spawn(cli.path ?? cli.command, args, {
    cwd,
    env: {
      ...process.env,
      PATH: executableSearchDirs().join(path.delimiter),
      HOME: homedir(),
      FORCE_COLOR: '0',
      OMP_APPROVAL_CONFIG: approvalConfigFile
    }
  })

  const session: Session = {
    id,
    cwd,
    title: path.basename(cwd) || 'New Chat',
    createdAt: Date.now(),
    status: 'idle',
    ...(opts?.resumeSessionPath ? { resumeFrom: opts.resumeSessionPath } : {})
  }

  sessions.set(id, { process: proc, session, pending: new Map(), draftText: '', lastAssistantText: '' })

  let buffer = ''
  proc.stdout?.on('data', (chunk: Buffer) => {
    const { lines, rest } = drainLines(buffer, chunk.toString('utf-8'))
    buffer = rest
    for (const line of lines) {
      // Query responses are claimed by id before the generic parser sees them
      let raw: Record<string, unknown> | null = null
      try {
        raw = JSON.parse(line)
      } catch {
        raw = null
      }
      if (raw && raw.type === 'response' && typeof raw.id === 'string') {
        const entry = sessions.get(id)
        const query = entry?.pending.get(raw.id)
        if (entry && query) {
          entry.pending.delete(raw.id)
          clearTimeout(query.timer)
          query.resolve(raw)
          continue
        }
      }
      const result = parseRpcLine(line, id)
      if (result.kind === 'event') {
        onEvent(result.event)
        trackAssistantText(id, result.event)
        // A failed command response ends the turn even without agent_end
        if (result.event.type === 'error') {
          onEvent({ type: 'status', sessionId: id, status: 'idle' })
        }
      } else if (result.kind === 'extension_ui') {
        // Forward interactive extension dialogs to the renderer; the answer
        // comes back through respondExtensionUi().
        onEvent({
          type: 'ui_request',
          sessionId: id,
          id: result.id,
          method: result.method,
          title: result.title,
          message: result.message,
          options: result.options,
          placeholder: result.placeholder,
          prefill: result.prefill,
          timeout: result.timeout
        })
      }
    }
  })

  // Buffer stderr instead of streaming it as chat errors; the CLI writes
  // progress/diagnostic noise there. Surface it only on abnormal exit.
  let stderrBuffer = ''
  proc.stderr?.on('data', (chunk: Buffer) => {
    stderrBuffer += chunk.toString('utf-8')
    if (stderrBuffer.length > 10_000) {
      stderrBuffer = stderrBuffer.slice(-10_000)
    }
  })

  proc.on('error', (err) => {
    sessions.delete(id)
    onEvent({
      type: 'error',
      sessionId: id,
      message: `Failed to start ${cli.command}: ${err.message}`
    })
    onEvent({ type: 'closed', sessionId: id })
  })

  proc.on('exit', (code) => {
    const entry = sessions.get(id)
    if (entry) {
      for (const query of entry.pending.values()) {
        clearTimeout(query.timer)
        query.resolve(null)
      }
      entry.pending.clear()
    }
    sessions.delete(id)
    onEvent({ type: 'closed', sessionId: id })
    if (code !== 0 && code !== null) {
      const detail = stderrBuffer.trim().split('\n').slice(-3).join('\n')
      onEvent({
        type: 'error',
        sessionId: id,
        message: `omp exited with code ${code}${detail ? `\n${detail}` : ''}`
      })
    }
  })

  onEvent({ type: 'connected', sessionId: id })

  const recent = getStore('recentProjects')
  if (!recent.includes(cwd)) {
    setStore('recentProjects', [cwd, ...recent].slice(0, 10))
  }

  return session
}

export function sendMessage(
  sessionId: string,
  text: string,
  images?: PromptImage[],
  streamingBehavior?: StreamingBehavior
): boolean {
  const entry = sessions.get(sessionId)
  if (!entry) return false
  const payload =
    JSON.stringify({
      id: crypto.randomUUID(),
      type: 'prompt',
      message: text,
      ...(images?.length ? { images } : {}),
      ...(streamingBehavior ? { streamingBehavior } : {})
    }) + '\n'
  entry.process.stdin?.write(payload)
  return true
}

export function killSession(sessionId: string): boolean {
  const entry = sessions.get(sessionId)
  if (!entry) return false
  entry.process.kill()
  sessions.delete(sessionId)
  // Drop the per-session approval config alongside the process.
  try {
    unlinkSync(path.join(app.getPath('userData'), `omp-approval-config-${sessionId}.json`))
  } catch {
    // already gone — fine
  }
  return true
}

export function abortSession(sessionId: string): boolean {
  const entry = sessions.get(sessionId)
  if (!entry) return false
  const payload = JSON.stringify({ id: crypto.randomUUID(), type: 'abort' }) + '\n'
  entry.process.stdin?.write(payload)
  return true
}

/** Answer (or cancel) a pending extension UI dialog for a session. */
export function respondExtensionUi(
  sessionId: string,
  requestId: string,
  answer: ExtensionUiAnswer
): boolean {
  const entry = sessions.get(sessionId)
  if (!entry) return false
  entry.process.stdin?.write(extensionUiResponse(requestId, answer))
  return true
}

/** Hot-switch the model of a live session via the RPC set_model command. */
export function setSessionModel(sessionId: string, provider: string, modelId: string): boolean {
  const entry = sessions.get(sessionId)
  if (!entry) return false
  const payload =
    JSON.stringify({ id: crypto.randomUUID(), type: 'set_model', provider, modelId }) + '\n'
  entry.process.stdin?.write(payload)
  return true
}

/**
 * Send an RPC command and await its response, matched by request id.
 * Resolves null on timeout, missing session, or process exit.
 */
function querySession(
  sessionId: string,
  command: Record<string, unknown>,
  timeoutMs = 8000
): Promise<Record<string, unknown> | null> {
  const entry = sessions.get(sessionId)
  if (!entry) return Promise.resolve(null)
  const id = crypto.randomUUID()
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      entry.pending.delete(id)
      resolve(null)
    }, timeoutMs)
    entry.pending.set(id, { resolve, timer })
    entry.process.stdin?.write(JSON.stringify({ id, ...command }) + '\n')
  })
}

/** Token/context usage for the usage monitor. */
export async function getSessionStats(sessionId: string): Promise<SessionStats | null> {
  const res = await querySession(sessionId, { type: 'get_session_stats' })
  if (!res || res.success !== true || !res.data) return null
  return res.data as SessionStats
}

/** Slash commands available in this session (extensions, prompts, skills). */
export async function listSessionCommands(sessionId: string): Promise<SlashCommand[]> {
  const res = await querySession(sessionId, { type: 'get_commands' })
  if (!res || res.success !== true || !res.data) return []
  const raw = (res.data as { commands?: unknown }).commands
  if (!Array.isArray(raw)) return []
  const out: SlashCommand[] = []
  for (const c of raw) {
    const cmd = c as { name?: unknown; description?: unknown; source?: unknown }
    if (typeof cmd?.name !== 'string') continue
    out.push({
      name: cmd.name,
      description: typeof cmd.description === 'string' ? cmd.description : undefined,
      source: cmd.source === 'extension' || cmd.source === 'skill' ? cmd.source : 'prompt'
    })
  }
  return out
}

/** Trigger context compaction; the summarization LLM call can take a while. */
export async function compactSession(sessionId: string): Promise<boolean> {
  const res = await querySession(sessionId, { type: 'compact' }, 120_000)
  return Boolean(res && res.success === true)
}

/** Inject a steering message into a running turn. */
export async function steer(
  sessionId: string,
  message: string,
  images?: PromptImage[]
): Promise<boolean> {
  const res = await querySession(sessionId, {
    type: 'steer',
    message,
    ...(images?.length ? { images } : {})
  })
  return Boolean(res && res.success === true)
}

/** Queue a follow-up message, delivered after the current turn finishes. */
export async function followUp(
  sessionId: string,
  message: string,
  images?: PromptImage[]
): Promise<boolean> {
  const res = await querySession(sessionId, {
    type: 'follow_up',
    message,
    ...(images?.length ? { images } : {})
  })
  return Boolean(res && res.success === true)
}

/** Change the thinking level of a live session. */
export async function setThinkingLevel(sessionId: string, level: ThinkingLevel): Promise<boolean> {
  const res = await querySession(sessionId, { type: 'set_thinking_level', level })
  return Boolean(res && res.success === true)
}

/** Export the session transcript as HTML; resolves the saved file path. */
export async function exportHtml(sessionId: string, outputPath?: string): Promise<string | null> {
  const res = await querySession(
    sessionId,
    { type: 'export_html', ...(outputPath ? { outputPath } : {}) },
    30_000
  )
  if (!res || res.success !== true || !res.data) return null
  const saved = (res.data as { path?: unknown }).path
  return typeof saved === 'string' ? saved : null
}

/** Live session state from the RPC get_state command. */
export async function getSessionState(sessionId: string): Promise<SessionState | null> {
  const res = await querySession(sessionId, { type: 'get_state' })
  if (!res || res.success !== true || !res.data) return null
  return res.data as SessionState
}

/** Full transcript of a session, mapped to GUI chat messages (get_messages). */
export async function getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  const res = await querySession(sessionId, { type: 'get_messages' }, 15_000)
  if (!res || res.success !== true || !res.data) return []
  const raw = (res.data as { messages?: unknown }).messages
  if (!Array.isArray(raw)) return []
  return mapAgentMessages(raw as AgentMessage[])
}

/** Set the session display name (single line, truncated to 60 chars). */
export async function setSessionName(sessionId: string, name: string): Promise<boolean> {
  const clean = name.replace(/[\r\n]+/g, ' ').trim().slice(0, 60)
  if (!clean) return false
  const res = await querySession(sessionId, { type: 'set_session_name', name: clean })
  return Boolean(res && res.success === true)
}

/**
 * Resume a persisted session file as a new live session and return it together
 * with its transcript in one round-trip. Returns null when the path is not a
 * session file under the sessions root, or when the CLI is unavailable.
 */
export async function resumeSession(
  cwd: string,
  onEvent: (event: SessionEvent) => void,
  filePath: string
): Promise<{ session: Session; messages: ChatMessage[] } | null> {
  if (!isSessionFilePath(filePath)) return null
  const session = createSession(cwd, onEvent, { resumeSessionPath: filePath })
  if (session.status === 'error') return null
  const messages = await getSessionMessages(session.id)
  return { session, messages }
}
