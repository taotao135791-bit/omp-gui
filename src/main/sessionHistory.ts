import { open, readdir, stat, unlink } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import path from 'node:path'
import { HistorySessionInfo } from '../shared/types'
import { defaultPiAgentDir } from './piSettings'

/**
 * Read-only access to pi's on-disk session files:
 * <agentDir>/sessions/<dirName>/<fileTimestamp>_<uuid>.jsonl
 *
 * dirName encodes the session's cwd (pi session-manager.js):
 *   `--${resolvedCwd.replace(/^[/\\]/,'').replace(/[/\\:]/g,'-')}--`
 * where resolvedCwd is the realpath of the cwd (/tmp → /private/tmp on macOS).
 *
 * The file opens with an optional {"type":"title",…} line (current omp),
 * then the {"type":"session","id","timestamp","cwd"} header, followed by
 * entries such as {"type":"message","message":<AgentMessage>}.
 */

/** Bytes of a session file scanned for the first user message (title source). */
const TITLE_SCAN_BYTES = 256 * 1024

/** Title fallback for sessions without a user message. */
const UNTITLED = 'Untitled'

export function sessionsRoot(agentDir: string = defaultPiAgentDir()): string {
  return path.join(agentDir, 'sessions')
}

/** pi's session directory for a project cwd (see header for the encoding). */
export function sessionDirFor(projectDir: string, agentDir: string = defaultPiAgentDir()): string {
  let resolved: string
  try {
    resolved = realpathSync(projectDir)
  } catch {
    resolved = path.resolve(projectDir)
  }
  const dirName = `--${resolved.replace(/^[/\\]/, '').replace(/[/\\:]/g, '-')}--`
  return path.join(sessionsRoot(agentDir), dirName)
}

/**
 * Guard for destructive/resume operations: the resolved path must be a
 * .jsonl file inside the sessions root (any project's directory within it).
 */
export function isSessionFilePath(
  filePath: string,
  agentDir: string = defaultPiAgentDir()
): boolean {
  if (typeof filePath !== 'string' || !filePath.endsWith('.jsonl')) return false
  const root = path.resolve(sessionsRoot(agentDir))
  const resolved = path.resolve(filePath)
  return resolved.startsWith(root + path.sep)
}

/** Read at most `bytes` from the start of a file. */
async function readHead(filePath: string, bytes: number): Promise<string> {
  const fh = await open(filePath, 'r')
  try {
    const buf = Buffer.alloc(bytes)
    const { bytesRead } = await fh.read(buf, 0, bytes, 0)
    return buf.toString('utf-8', 0, bytesRead)
  } finally {
    await fh.close()
  }
}

/** Join the text blocks of an AgentMessage content array (or plain string). */
function textContentOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content as Array<{ type?: unknown; text?: unknown }>) {
    if (block?.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text)
    }
  }
  return parts.join('\n')
}

/**
 * Parse one session file: the session header for id/timestamp/cwd, then the
 * first user message (within TITLE_SCAN_BYTES) for the title. Returns null
 * for files without a parseable session header.
 *
 * Header position is deliberately not pinned to line 0: legacy pi opens the
 * file with {"type":"session",…} directly, current omp prepends a
 * {"type":"title",…} line. Scan the first few lines for the header instead.
 */
async function parseSessionFile(filePath: string): Promise<HistorySessionInfo | null> {
  let head: string
  try {
    head = await readHead(filePath, TITLE_SCAN_BYTES)
  } catch {
    return null
  }
  const lines = head.split('\n')
  let header: { id: string; timestamp?: unknown; cwd?: unknown } | null = null
  let headerIndex = -1
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    if (!lines[i].trim()) continue
    let candidate: { type?: unknown; id?: unknown; timestamp?: unknown; cwd?: unknown }
    try {
      candidate = JSON.parse(lines[i])
    } catch {
      continue
    }
    if (candidate?.type === 'session' && typeof candidate.id === 'string') {
      header = { id: candidate.id, timestamp: candidate.timestamp, cwd: candidate.cwd }
      headerIndex = i
      break
    }
  }
  if (!header) return null

  let timestamp =
    typeof header.timestamp === 'number' ? header.timestamp : Date.parse(String(header.timestamp))
  if (!Number.isFinite(timestamp)) {
    // Header without a usable timestamp — fall back to the file's mtime.
    timestamp = await stat(filePath).then((s) => s.mtimeMs, () => 0)
  }

  let title = UNTITLED
  for (const line of lines.slice(headerIndex + 1)) {
    if (!line.trim()) continue
    let entry: { type?: unknown; message?: { role?: unknown; content?: unknown } }
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    if (entry?.type === 'message' && entry.message?.role === 'user') {
      const text = textContentOf(entry.message.content).replace(/\s+/g, ' ').trim()
      if (text) {
        title = text.slice(0, 80)
        break
      }
    }
  }

  return {
    uuid: header.id,
    filePath,
    title,
    timestamp,
    cwd: typeof header.cwd === 'string' ? header.cwd : ''
  }
}

/**
 * List persisted sessions of a project, newest first.
 * Returns [] when the project has no session directory.
 */
export async function listSessionHistory(
  projectDir: string,
  agentDir?: string
): Promise<HistorySessionInfo[]> {
  const dir = sessionDirFor(projectDir, agentDir)
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return []
  }
  const out: HistorySessionInfo[] = []
  for (const name of names) {
    if (!name.endsWith('.jsonl')) continue
    const info = await parseSessionFile(path.join(dir, name))
    if (info) out.push(info)
  }
  out.sort((a, b) => b.timestamp - a.timestamp)
  return out
}

/** Delete a session file; guarded to .jsonl files inside the sessions root. */
export async function deleteSessionFile(filePath: string, agentDir?: string): Promise<boolean> {
  if (!isSessionFilePath(filePath, agentDir)) return false
  try {
    await unlink(filePath)
    return true
  } catch {
    return false
  }
}
