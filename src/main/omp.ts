import { spawn, ChildProcess } from 'node:child_process'
import { accessSync, constants, existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { CliInfo, ExtensionUiAnswer, Session, SessionEvent, ToolAccess } from '../shared/types'
import { getStore, setStore } from './store'
import { parseRpcLine, drainLines, extensionUiResponse } from './protocol'

const sessions = new Map<string, { process: ChildProcess; session: Session }>()

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

export function createSession(
  cwd: string,
  onEvent: (event: SessionEvent) => void
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
  const toolAccess: ToolAccess = getStore('toolAccess')
  // pi has no built-in tool approval; coarse-grained gating goes through
  // --exclude-tools. 'full' leaves all seven built-in tools enabled.
  if (toolAccess === 'no-bash') {
    args.push('--exclude-tools', 'bash')
  } else if (toolAccess === 'readonly') {
    args.push('--exclude-tools', 'bash,edit,write')
  }
  const proc = spawn(cli.path ?? cli.command, args, {
    cwd,
    env: {
      ...process.env,
      PATH: executableSearchDirs().join(path.delimiter),
      HOME: homedir(),
      FORCE_COLOR: '0'
    }
  })

  const session: Session = {
    id,
    cwd,
    title: path.basename(cwd) || 'New Chat',
    createdAt: Date.now(),
    status: 'idle'
  }

  sessions.set(id, { process: proc, session })

  let buffer = ''
  proc.stdout?.on('data', (chunk: Buffer) => {
    const { lines, rest } = drainLines(buffer, chunk.toString('utf-8'))
    buffer = rest
    for (const line of lines) {
      const result = parseRpcLine(line, id)
      if (result.kind === 'event') {
        onEvent(result.event)
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

export function sendMessage(sessionId: string, text: string): boolean {
  const entry = sessions.get(sessionId)
  if (!entry) return false
  const payload =
    JSON.stringify({ id: crypto.randomUUID(), type: 'prompt', message: text }) + '\n'
  entry.process.stdin?.write(payload)
  return true
}

export function killSession(sessionId: string): boolean {
  const entry = sessions.get(sessionId)
  if (!entry) return false
  entry.process.kill()
  sessions.delete(sessionId)
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
